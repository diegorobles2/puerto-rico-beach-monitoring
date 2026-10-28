import { IngestionService } from './ingestion.service';
import type { DrnaService } from '../data-sources/drna/drna.service';
import type { DrnaCatalog } from '../data-sources/drna/drna.types';
import { NwsConditionsService } from '../conditions/nws-conditions.service';
import { NwsPersistenceService } from './nws-persistence.service';
import { operationalNwsZone, operationalNwsZones } from '../data-sources/nws/nws-mapping-eligibility';
import { up as addNwsPersistence } from '../database/migrations/20261016190000_add_nws_persistence';
﻿import 'dotenv/config';
import knex, { type Knex } from 'knex';
import type { NwsService } from '../data-sources/nws/nws.service';
import { NwsHttpError, NwsInvalidResponseError, NwsMarinePointError, NwsTransportError } from '../data-sources/nws/nws.errors';
import { up as addZone } from '../database/migrations/20261015010240_add_nws_forecast_zone';
import { up as addProvenance } from '../database/migrations/20261025230000_add_nws_mapping_provenance';
import { up as addInvalidation, down as removeInvalidation } from '../database/migrations/20261025233000_invalidate_stale_nws_mappings';
import { NWS_FALLBACK_REVIEWS, NWS_FALLBACK_REGISTRY_VERSION } from './nws-fallback-registry';
import { NwsMappingService } from './nws-mapping.service';

const connection = process.env.NWS_MIGRATION_TEST_DATABASE_URL;
function safeLocalTestDatabase(value: string | undefined): boolean {
  if (!value) return false;
  try { const url = new URL(value); return ['postgres:', 'postgresql:'].includes(url.protocol)
    && ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/beach_monitoring_migration_test'; } catch { return false; }
}
const describeDatabase = safeLocalTestDatabase(connection) ? describe : describe.skip;
const url = 'https://api.weather.gov/points/17.9747944,-67.2129056';
const station = { drna_station_id: 'RW-12B', name: 'Test beach', municipality: 'Test', latitude: 17.9747944, longitude: -67.2129056 };
const automatic = { nws_forecast_zone: 'PRZ011', nws_mapping_method: 'automatic', nws_mapping_latitude: station.latitude, nws_mapping_longitude: station.longitude };
const fallback = { ...automatic, nws_mapping_method: 'verified-fallback', nws_mapping_registry_version: NWS_FALLBACK_REGISTRY_VERSION };
const legacy = { nws_forecast_zone: 'PRZ011', nws_mapping_method: 'legacy' };
const counts = (changes: Record<string, number> = {}) => ({ automatic: 0, verifiedFallbacks: 0, preserved: 0, unresolved: 0, lookupFailures: 0, ...changes });
const nws = (get: jest.Mock) => ({ getForecastZone: get } as unknown as NwsService);
const marine = () => new NwsMarinePointError('AMZ745', station.latitude, station.longitude, url);
const failure = () => new NwsTransportError('timeout', 'point metadata', url);

async function createFixture(db: Knex) {
  await db.raw(`create table public.beaches (
    id bigint generated always as identity primary key, drna_station_id text not null unique,
    name text not null, municipality text not null,
    latitude double precision check (latitude between -90 and 90),
    longitude double precision check (longitude between -180 and 180)
  )`);
  await addZone(db); await addProvenance(db);
}
function localDatabase() { return knex({ client: 'pg', connection, pool: { min: 0, max: 3 }, acquireConnectionTimeout: 10000 }); }

describeDatabase('NWS mapping selection and invalidation (PostgreSQL)', () => {
  let db: Knex;
  let trx: Knex.Transaction | undefined;
  beforeAll(async () => {
    db = localDatabase();
    if (await db.schema.withSchema('public').hasTable('beaches')) throw new Error('Refusing to alter an existing beaches table');
  });
  beforeEach(async () => { trx = await db.transaction(); await createFixture(trx); await addInvalidation(trx); });
  afterEach(async () => { if (trx) { await trx.rollback(); trx = undefined; } });
  afterAll(async () => { if (db) await db.destroy(); });
  const row = () => trx!('public.beaches').first();
  const run = (get: jest.Mock) => new NwsMappingService(nws(get), trx!).refresh();

  it.each(['automatic', 'verified-fallback'] as const)('skips the PostgreSQL UPDATE for identical %s results', async method => {
    await trx!('public.beaches').insert(station);
    const writes: string[] = [];
    const listener = (query: { sql: string }) => { if (/^update\s+(?:"public"\.)?"beaches"\s/i.test(query.sql)) writes.push(query.sql); };
    trx!.on('query', listener);
    try {
      const get = method === 'automatic' ? jest.fn().mockResolvedValue('PRZ011') : jest.fn().mockRejectedValue(marine());
      const expected = counts(method === 'automatic' ? { automatic: 1 } : { verifiedFallbacks: 1 });
      expect(await run(get)).toEqual(expected); expect(writes).toHaveLength(1);
      const physicalBefore = await trx!('public.beaches').select(trx!.raw('ctid::text as tuple')).first();
      expect(await run(get)).toEqual(expected); expect(writes).toHaveLength(1);
      expect(await trx!('public.beaches').select(trx!.raw('ctid::text as tuple')).first()).toEqual(physicalBefore);
      expect(get).toHaveBeenCalledTimes(2);
    } finally { trx!.off('query', listener); }
  });
  it('still writes a same-zone provenance upgrade', async () => {
    await trx!('public.beaches').insert({ ...station, ...fallback });
    const before = await trx!('public.beaches').select(trx!.raw('ctid::text as tuple')).first();
    expect(await run(jest.fn().mockResolvedValue('PRZ011'))).toEqual(counts({ automatic: 1 }));
    expect(await trx!('public.beaches').select(trx!.raw('ctid::text as tuple')).first()).not.toEqual(before);
    expect(await row()).toMatchObject({ nws_mapping_method: 'automatic', nws_mapping_registry_version: null });
  });
  it('skips repeated errors but updates changed errors and clears them on success', async () => {
    await trx!('public.beaches').insert(station);
    const get = jest.fn().mockRejectedValueOnce(new NwsHttpError(404, 'point metadata', url))
      .mockRejectedValueOnce(new NwsHttpError(404, 'point metadata', url))
      .mockRejectedValueOnce(failure()).mockResolvedValue('PRZ011');
    const tuple = () => trx!('public.beaches').select(trx!.raw('ctid::text as tuple')).first();
    expect(await run(get)).toEqual(counts({ unresolved: 1, lookupFailures: 1 })); const first = await tuple();
    expect(await run(get)).toEqual(counts({ unresolved: 1, lookupFailures: 1 })); expect(await tuple()).toEqual(first);
    expect(await run(get)).toEqual(counts({ unresolved: 1, lookupFailures: 1 })); expect(await tuple()).not.toEqual(first);
    expect(await run(get)).toEqual(counts({ automatic: 1 })); expect((await row()).nws_mapping_error).toBeNull();
  });

  it.each(['RW-12B', 'RW-13'])('preserves repeated real DRNA upserts and invalidates only changed %s', async changedStation => {
    const catalog: DrnaCatalog = {
      stations: [
        { stationId: 'RW-12B', name: 'Combate', municipality: 'Cabo Rojo', latitude: station.latitude, longitude: station.longitude },
        { stationId: 'RW-13', name: 'Boqueron', municipality: 'Cabo Rojo', latitude: 18.0194417, longitude: -67.1722444 },
      ], observations: [], rejectedRows: 0, sourceRows: 2,
    };
    // Mock only catalog retrieval: execute the actual ingestion transaction/upsert and trigger.
    const drna = { getCatalog: jest.fn(async () => structuredClone(catalog)) } as unknown as DrnaService;
    const ingestion = new IngestionService(drna, trx!);
    await ingestion.refresh();
    const get = jest.fn(async (latitude: number, longitude: number) => {
      if (latitude === station.latitude) return 'PRZ011';
      throw new NwsMarinePointError('AMZ745', latitude, longitude, url);
    });
    expect(await run(get)).toEqual(counts({ automatic: 1, verifiedFallbacks: 1 }));
    const all = () => trx!('public.beaches').select('*').orderBy('drna_station_id');
    const before = await all();
    await ingestion.refresh(); await ingestion.refresh();
    expect(await all()).toEqual(before);
    const changed = catalog.stations.find(s => s.stationId === changedStation)!;
    const originalLatitude = changed.latitude!; changed.latitude = originalLatitude + 0.001;
    await ingestion.refresh();
    const after = await all();
    expect(after).toHaveLength(2); expect(new Set(after.map(r => r.drna_station_id)).size).toBe(2);
    expect(after.find(r => r.drna_station_id === changedStation)).toMatchObject({ latitude: changed.latitude,
      nws_forecast_zone: null, nws_mapping_method: null, nws_mapping_latitude: null, nws_mapping_longitude: null, nws_mapping_registry_version: null });
    expect(after.find(r => r.drna_station_id !== changedStation)).toEqual(before.find(r => r.drna_station_id !== changedStation));
    changed.latitude = originalLatitude; await ingestion.refresh();
    const restored = await all();
    expect(restored.find(r => r.drna_station_id === changedStation)).toMatchObject({ latitude: originalLatitude,
      nws_forecast_zone: null, nws_mapping_method: null, nws_mapping_latitude: null, nws_mapping_longitude: null, nws_mapping_registry_version: null });
    expect(restored.find(r => r.drna_station_id !== changedStation)).toEqual(before.find(r => r.drna_station_id !== changedStation));
    expect(restored.map(r => r.id)).toEqual(before.map(r => r.id));
    expect(get).toHaveBeenCalledTimes(2);
  });

  async function cachedNwsData() {
    await addNwsPersistence(trx!);
    const now = new Date().toISOString();
    await trx!('nws_conditions').insert({ zone_id: 'PRZ011', forecast_period: 'TODAY', risk: 'moderate',
      summary: 'Moderate rip-current risk.', source_url: 'https://api.weather.gov/products/test', observed_at: now, retrieved_at: now });
    await trx!('nws_alert_snapshots').insert({ zone_id: 'PRZ011', retrieved_at: now });
    await trx!('nws_alerts').insert({ id: 'test-operational-alert', title: 'Test alert', description: 'Test alert description',
      instruction: null, severity: 'Moderate', certainty: 'Likely', urgency: 'Expected', effective_at: now,
      expires_at: new Date(Date.now() + 3600000).toISOString(), source_url: 'https://api.weather.gov/alerts/test', observed_at: now, retrieved_at: now });
    await trx!('nws_alert_zones').insert({ alert_id: 'test-operational-alert', zone_id: 'PRZ011', is_active: true, last_seen_at: now });
  }

  it.each([
    ['HTTP 404', new NwsHttpError(404, 'point metadata', url)],
    ['HTTP 429', new NwsHttpError(429, 'point metadata', url)],
    ['HTTP 503', new NwsHttpError(503, 'point metadata', url)],
    ['timeout', new NwsTransportError('timeout', 'point metadata', url)],
    ['network', new NwsTransportError('network', 'point metadata', url)],
    ['malformed JSON', new NwsInvalidResponseError('Malformed JSON', url)],
    ['invalid payload', new NwsInvalidResponseError('Invalid payload', url)],
    ['unmatched marine', new NwsMarinePointError('AMZ712', station.latitude, station.longitude, url)],
  ] as const)('retains legacy on %s but cannot authorize fresh cached data', async (_name, error) => {
    await trx!('public.beaches').insert({ ...station, ...legacy });
    await cachedNwsData();
    const before = await row();
    const result = await run(jest.fn().mockRejectedValue(error));
    expect(result.preserved).toBe(1); expect(result.verifiedFallbacks).toBe(0);
    expect(await row()).toEqual(before);
    expect(operationalNwsZone(await row())).toBeNull();
    expect(await operationalNwsZones(trx!)).toEqual([]);
    const publicReader = new NwsConditionsService(trx!);
    expect(await publicReader.getOceanRisk(Number(before.id))).toMatchObject({ zoneId: null, availability: 'unavailable', status: 'unknown' });
    expect(await publicReader.getAlerts(Number(before.id))).toMatchObject({ zoneId: null, availability: 'unavailable', status: 'unknown', alerts: null });
    const storedReader = new NwsPersistenceService(trx!);
    expect(await storedReader.getStoredConditionsByBeach(String(before.id))).toEqual({ beachId: String(before.id), zoneId: null, condition: null });
    expect(await storedReader.getStoredAlertsByBeach(String(before.id))).toEqual({ beachId: String(before.id), zoneId: null, alerts: [] });
  });

  it('retains coordinate-less legacy history but every reader remains unavailable', async () => {
    await trx!('public.beaches').insert({ ...station, ...legacy, latitude: null, longitude: null });
    const before = await row(); const get = jest.fn();
    expect(await run(get)).toEqual(counts({ preserved: 1, lookupFailures: 1 }));
    expect(get).not.toHaveBeenCalled(); expect(await row()).toEqual(before);
    expect(await operationalNwsZones(trx!)).toEqual([]);
    expect(await new NwsConditionsService(trx!).getOceanRisk(Number(before.id))).toMatchObject({ availability: 'unavailable', zoneId: null });
    expect(await new NwsPersistenceService(trx!).getStoredConditionsByBeach(String(before.id))).toEqual({ beachId: String(before.id), zoneId: null, condition: null });
  });

  it.each([
    ['automatic', automatic], ['verified fallback', fallback],
    ['mismatched automatic', { ...automatic, nws_mapping_latitude: 18 }],
    ['mismatched fallback', { ...fallback, nws_mapping_longitude: -66 }],
  ] as const)('uses proven matching provenance for every reader: %s', async (name, mapping) => {
    await trx!('public.beaches').insert({ ...station, ...mapping }); await cachedNwsData();
    const beach = await row(); const eligible = !name.startsWith('mismatched');
    const publicReader = new NwsConditionsService(trx!); const storedReader = new NwsPersistenceService(trx!);
    expect(await publicReader.getOceanRisk(Number(beach.id))).toMatchObject({ zoneId: eligible ? 'PRZ011' : null, availability: eligible ? 'available' : 'unavailable' });
    expect(await publicReader.getAlerts(Number(beach.id))).toMatchObject({ zoneId: eligible ? 'PRZ011' : null, status: eligible ? 'active-alerts' : 'unknown' });
    const condition = await storedReader.getStoredConditionsByBeach(String(beach.id));
    const alerts = await storedReader.getStoredAlertsByBeach(String(beach.id));
    expect(condition?.zoneId).toBe(eligible ? 'PRZ011' : null); expect(Boolean(condition?.condition)).toBe(eligible);
    expect(alerts?.zoneId).toBe(eligible ? 'PRZ011' : null); expect(alerts?.alerts).toHaveLength(eligible ? 1 : 0);
    expect(await operationalNwsZones(trx!)).toEqual(eligible ? ['PRZ011'] : []);
  });

  it.each(['automatic', 'verified-fallback'] as const)('revalidates retained legacy history through %s', async method => {
    await trx!('public.beaches').insert({ ...station, ...legacy }); await cachedNwsData();
    expect(await operationalNwsZones(trx!)).toEqual([]);
    await run(method === 'automatic' ? jest.fn().mockResolvedValue('PRZ011') : jest.fn().mockRejectedValue(marine()));
    const beach = await row(); expect(beach.nws_mapping_method).toBe(method);
    expect(await operationalNwsZones(trx!)).toEqual(['PRZ011']);
    expect(await new NwsConditionsService(trx!).getOceanRisk(Number(beach.id))).toMatchObject({ availability: 'available', zoneId: 'PRZ011' });
  });

  it('writes automatic provenance and upgrades a fallback', async () => {
    await trx!('public.beaches').insert({ ...station, ...fallback });
    expect(await run(jest.fn().mockResolvedValue('PRZ001'))).toEqual(counts({ automatic: 1 }));
    expect(await row()).toMatchObject({ nws_forecast_zone: 'PRZ001', nws_mapping_method: 'automatic',
      nws_mapping_latitude: station.latitude, nws_mapping_longitude: station.longitude, nws_mapping_registry_version: null });
  });
  it('applies all 15 verified registry entries including contained RW-1A', async () => {
    await trx!('public.beaches').insert(NWS_FALLBACK_REVIEWS.map(r => ({ drna_station_id: r.stationId,
      name: r.beachName, municipality: r.municipality, ...r.reviewedCoordinates })));
    const get = jest.fn(async (latitude: number, longitude: number) => {
      const r = NWS_FALLBACK_REVIEWS.find(r => r.reviewedCoordinates.latitude === latitude && r.reviewedCoordinates.longitude === longitude)!;
      throw new NwsMarinePointError(r.originalMarineZone, latitude, longitude, url);
    });
    expect(await run(get)).toEqual(counts({ verifiedFallbacks: 15 }));
    expect(await trx!('public.beaches').where({ drna_station_id: 'RW-1A' }).first()).toMatchObject({ nws_forecast_zone: 'PRZ002', nws_mapping_method: 'verified-fallback', nws_mapping_registry_version: NWS_FALLBACK_REGISTRY_VERSION });
  });
  it('repeated fallback runs leave identical database state', async () => {
    await trx!('public.beaches').insert(station);
    const get = jest.fn().mockRejectedValue(marine());
    expect(await run(get)).toEqual(counts({ verifiedFallbacks: 1 }));
    const before = await row();
    expect(await run(get)).toEqual(counts({ verifiedFallbacks: 1 })); expect(await row()).toEqual(before);
  });
  it.each([
    ['unknown station', { drna_station_id: 'unknown' }, marine()],
    ['different coordinate', { latitude: station.latitude + 1e-9 }, new NwsMarinePointError('AMZ745', station.latitude + 1e-9, station.longitude, url)],
    ['different marine zone', {}, new NwsMarinePointError('AMZ712', station.latitude, station.longitude, url)],
    ['404', {}, new NwsHttpError(404, 'point metadata', url)],
    ['rate limit', {}, new NwsHttpError(429, 'point metadata', url)],
  ] as const)('does not apply fallback after %s', async (_name, changes, error) => {
    await trx!('public.beaches').insert({ ...station, ...changes });
    const result = await run(jest.fn().mockRejectedValue(error));
    expect(result.unresolved).toBe(1); expect(result.verifiedFallbacks).toBe(0);
    expect((await row()).nws_forecast_zone).toBeNull();
  });
  it.each([['automatic', automatic], ['fallback', fallback], ['legacy', legacy]] as const)(
    'preserves %s on temporary failure without inventing provenance', async (_name, mapping) => {
      await trx!('public.beaches').insert({ ...station, ...mapping }); const before = await row();
      expect(await run(jest.fn().mockRejectedValue(failure()))).toEqual(counts({ preserved: 1, lookupFailures: 1 }));
      expect(await row()).toEqual(before);
    },
  );
  it('upgrades legacy only after a successful exact lookup', async () => {
    await trx!('public.beaches').insert({ ...station, ...legacy });
    expect(await run(jest.fn().mockResolvedValue('PRZ001'))).toEqual(counts({ automatic: 1 }));
    expect(await row()).toMatchObject({ nws_mapping_method: 'automatic', nws_mapping_latitude: station.latitude });
  });
  it.each([['automatic', automatic], ['fallback', fallback], ['legacy', legacy]] as const)(
    'atomically invalidates %s on coordinate change, including change-and-restore', async (_name, mapping) => {
      await trx!('public.beaches').insert({ ...station, ...mapping });
      await trx!('public.beaches').update({ latitude: 18 });
      expect(await row()).toMatchObject({ nws_forecast_zone: null, nws_mapping_method: null, nws_mapping_latitude: null,
        nws_mapping_longitude: null, nws_mapping_registry_version: null });
      await trx!('public.beaches').update({ latitude: station.latitude });
      expect((await row()).nws_forecast_zone).toBeNull();
      expect(await run(jest.fn().mockRejectedValue(failure()))).toEqual(counts({ unresolved: 1, lookupFailures: 1 }));
    },
  );
  it('does not invalidate on a coordinate no-op or ordinary metadata edit', async () => {
    await trx!('public.beaches').insert({ ...station, ...fallback });
    const before = await row();
    await trx!('public.beaches').update({ latitude: station.latitude, longitude: station.longitude, name: 'Renamed' });
    expect(await row()).toEqual({ ...before, name: 'Renamed' });
  });
  it('invalidates when either coordinate becomes NULL', async () => {
    await trx!('public.beaches').insert({ ...station, ...automatic });
    await trx!('public.beaches').update({ longitude: null });
    const get = jest.fn();
    expect(await run(get)).toEqual(counts({ unresolved: 1, lookupFailures: 1 }));
    expect(get).not.toHaveBeenCalled(); expect((await row()).nws_forecast_zone).toBeNull();
  });
  it('repairs stale provenance present before installing the invalidation trigger', async () => {
    await removeInvalidation(trx!);
    await trx!('public.beaches').insert({ ...station, ...fallback, nws_mapping_latitude: 18 });
    await addInvalidation(trx!);
    expect(await row()).toMatchObject({ nws_forecast_zone: null, nws_mapping_method: null });
  });
  it('detects stale proven coordinates during refresh even if inserted after migration', async () => {
    await trx!('public.beaches').insert({ ...station, ...automatic, nws_mapping_longitude: -66 });
    const get = jest.fn(async () => { expect((await row()).nws_forecast_zone).toBeNull(); throw failure(); });
    expect(await run(get)).toEqual(counts({ unresolved: 1, lookupFailures: 1 }));
  });
  it('rejects an interleaved coordinate edit during the lookup', async () => {
    await trx!('public.beaches').insert({ ...station, ...automatic });
    const get = jest.fn(async () => { await trx!('public.beaches').update({ latitude: 18 }); return 'PRZ011'; });
    expect(await run(get)).toEqual(counts({ unresolved: 1 }));
    expect((await row()).nws_forecast_zone).toBeNull();
  });
  it('rolls back only the invalidation trigger/function without changing saved mappings', async () => {
    await trx!('public.beaches').insert({ ...station, ...fallback }); const before = await row();
    await removeInvalidation(trx!); expect(await row()).toEqual(before);
    expect((await trx!.raw("select to_regprocedure('public.invalidate_nws_mapping_on_coordinate_change()') as function")).rows[0].function).toBeNull();
    await addInvalidation(trx!); expect(await row()).toEqual(before);
  });
});

describeDatabase('NWS mapping with independent PostgreSQL connections', () => {
  it.each(['automatic', 'verified-fallback'] as const)('rejects an old-coordinate result after another connection edits %s', async method => {
    const db = localDatabase(); const other = localDatabase(); let ownsFixture = false;
    try {
      if (await db.schema.withSchema('public').hasTable('beaches')) throw new Error('Refusing to alter an existing beaches table');
      // Commit a fixture owned solely by this test so a second connection can see it.
      await db.transaction(async trx => { await createFixture(trx); await addInvalidation(trx); await trx('public.beaches').insert({ ...station, ...(method === 'automatic' ? automatic : fallback) }); });
      ownsFixture = true;
      const firstPid = (await db.raw('select pg_backend_pid() as pid')).rows[0].pid;
      const otherPid = (await other.raw('select pg_backend_pid() as pid')).rows[0].pid;
      expect(otherPid).not.toBe(firstPid);
      const get = jest.fn(async () => { await other('public.beaches').update({ latitude: 18 }); return method === 'automatic' ? 'PRZ011' : 'PRZ001'; });
      expect(await new NwsMappingService(nws(get), db).refresh()).toEqual(counts({ unresolved: 1 }));
      expect(await db('public.beaches').first()).toMatchObject({ latitude: 18, nws_forecast_zone: null, nws_mapping_method: null });
    } finally {
      if (ownsFixture) await db.transaction(async trx => { await removeInvalidation(trx); await trx.schema.withSchema('public').dropTable('beaches'); });
      await other.destroy(); await db.destroy();
    }
  });
});
