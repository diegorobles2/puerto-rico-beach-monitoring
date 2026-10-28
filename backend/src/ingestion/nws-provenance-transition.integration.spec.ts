import knex, { type Knex } from 'knex';
import { resolve } from 'node:path';
import { operationalNwsZone } from '../data-sources/nws/nws-mapping-eligibility';
import { NwsHttpError, NwsInvalidResponseError, NwsMarinePointError, NwsTransportError } from '../data-sources/nws/nws.errors';
import { transitionNwsProvenance } from './nws-provenance-transition';

const connection = process.env.NWS_MIGRATION_TEST_DATABASE_URL;
const safe = (() => {
  try {
    const url = new URL(connection ?? '');
    return ['postgres:', 'postgresql:'].includes(url.protocol) && ['127.0.0.1', 'localhost'].includes(url.hostname)
      && url.pathname === '/beach_monitoring_migration_test';
  } catch { return false; }
})();
const describeDatabase = safe ? describe : describe.skip;
const directory = resolve(__dirname, '../database/migrations');
const previousMigrations = [
  '20261003195916_initial_drna_schema.ts', '20261003200303_secure_knex_migration_tables.ts',
  '20261003204215_prevent_duplicate_water_quality_observations.ts', '20261007043531_support_greater_than_qualifier.ts',
  '20261015010240_add_nws_forecast_zone.ts', '20261016190000_add_nws_persistence.ts',
];
const station = { drna_station_id: 'existing', name: 'Previously mapped', municipality: 'Test',
  latitude: 18.4, longitude: -66.1, nws_forecast_zone: 'PRZ001' };
const source = 'https://api.weather.gov/points/18.4,-66.1';

describeDatabase('Atomic NWS provenance cutover (PostgreSQL)', () => {
  let db: Knex;
  let trx: Knex.Transaction;
  beforeAll(async () => {
    db = knex({ client: 'pg', connection, pool: { min: 0, max: 2 } });
    if (await db.schema.hasTable('beaches')) throw new Error('Refusing an existing application schema');
    if (await db.schema.hasTable('knex_migrations') && (await db('knex_migrations')).length) {
      throw new Error('Refusing existing migration history');
    }
  });
  beforeEach(async () => {
    trx = await db.transaction();
    for (const name of previousMigrations) await trx.migrate.up({ directory, name, loadExtensions: ['.ts'] });
    await trx('beaches').insert(station);
  });
  afterEach(async () => { if (trx) await trx.rollback(); });
  afterAll(async () => { if (db) await db.destroy(); });
  const row = () => trx('beaches').where({ drna_station_id: station.drna_station_id }).first();

  it('preserves validated existing zones and cached data through the actual migration runner', async () => {
    await trx('nws_conditions').insert({ zone_id: 'PRZ001', forecast_period: 'Today', risk: 'moderate',
      summary: 'Existing condition', source_url: source, retrieved_at: new Date() });
    const cached = await trx('nws_conditions').first();
    const getForecastZone = jest.fn().mockResolvedValue('PRZ001');
    expect(await transitionNwsProvenance(trx, { getForecastZone })).toEqual({ validated: 1 });
    expect(getForecastZone).toHaveBeenCalledWith(18.4, -66.1);
    expect(operationalNwsZone(await row())).toBe('PRZ001');
    expect(await row()).toMatchObject({ ...station, nws_mapping_method: 'automatic',
      nws_mapping_latitude: 18.4, nws_mapping_longitude: -66.1, nws_mapping_registry_version: null });
    expect(await trx('nws_conditions').first()).toEqual(cached);
    expect(await trx('knex_migrations')).toHaveLength(8);
  });

  it.each([
    ['404', new NwsHttpError(404, 'point metadata', source)],
    ['429', new NwsHttpError(429, 'point metadata', source)],
    ['503', new NwsHttpError(503, 'point metadata', source)],
    ['timeout', new NwsTransportError('timeout', 'point metadata', source)],
    ['network', new NwsTransportError('network', 'point metadata', source)],
    ['malformed', new NwsInvalidResponseError('Invalid response', source)],
    ['marine', new NwsMarinePointError('AMZ712', 18.4, -66.1, source)],
  ])('leaves the old schema and mappings intact on %s validation failure', async (_name, error) => {
    const before = await row();
    await expect(transitionNwsProvenance(trx, { getForecastZone: jest.fn().mockRejectedValue(error) })).rejects.toThrow('validation failed');
    expect(await trx.schema.hasColumn('beaches', 'nws_mapping_method')).toBe(false);
    expect(await row()).toEqual(before);
    expect(await trx('knex_migrations')).toHaveLength(6);
  });

  it('does not partially migrate after some successful validations', async () => {
    await trx('beaches').insert({ ...station, drna_station_id: 'second' });
    const getForecastZone = jest.fn().mockResolvedValueOnce('PRZ001').mockRejectedValueOnce(new Error('offline'));
    await expect(transitionNwsProvenance(trx, { getForecastZone })).rejects.toThrow('validation failed');
    expect(await trx.schema.hasColumn('beaches', 'nws_mapping_method')).toBe(false);
    expect(await trx('knex_migrations')).toHaveLength(6);
  });

  it('rejects a different or malformed zone rather than promoting ambiguous history', async () => {
    for (const zone of ['PRZ002', 'invalid']) {
      await expect(transitionNwsProvenance(trx, { getForecastZone: jest.fn().mockResolvedValue(zone) })).rejects.toThrow('zone changed');
    }
    expect(await trx.schema.hasColumn('beaches', 'nws_mapping_method')).toBe(false);
  });

  it('rejects missing coordinates without making a lookup', async () => {
    await trx('beaches').update({ latitude: null });
    const getForecastZone = jest.fn();
    await expect(transitionNwsProvenance(trx, { getForecastZone })).rejects.toThrow('Cannot validate');
    expect(getForecastZone).not.toHaveBeenCalled();
  });

  it.each(['latitude', 'drna_station_id', 'nws_forecast_zone'] as const)('rejects %s changes during validation', async field => {
    const changes = { latitude: 18.5, drna_station_id: 'changed', nws_forecast_zone: 'PRZ002' };
    const getForecastZone = jest.fn(async () => {
      await trx('beaches').update({ [field]: changes[field] });
      return 'PRZ001';
    });
    await expect(transitionNwsProvenance(trx, { getForecastZone })).rejects.toThrow('changed during NWS validation');
    expect(await trx.schema.hasColumn('beaches', 'nws_mapping_method')).toBe(false);
  });

  it('rolls back schema and provenance together if migration fails', async () => {
    await expect(transitionNwsProvenance(trx, { getForecastZone: jest.fn().mockResolvedValue('PRZ001') }, async transaction => {
      await transaction.migrate.latest({ directory, loadExtensions: ['.ts'] });
      throw new Error('deployment interrupted');
    })).rejects.toThrow('deployment interrupted');
    expect(await trx.schema.hasColumn('beaches', 'nws_mapping_method')).toBe(false);
    expect(await trx('knex_migrations')).toHaveLength(6);
    expect(await row()).toMatchObject(station);
  });

  it('is idempotent, leaves new unmapped beaches alone and retains coordinate invalidation', async () => {
    await trx('beaches').insert({ ...station, drna_station_id: 'unmapped', nws_forecast_zone: null });
    const nws = { getForecastZone: jest.fn().mockResolvedValue('PRZ001') };
    await transitionNwsProvenance(trx, nws);
    const before = await row();
    expect(await transitionNwsProvenance(trx, nws)).toEqual({ validated: 0 });
    expect(await row()).toEqual(before); expect(nws.getForecastZone).toHaveBeenCalledTimes(1);
    expect(await trx('beaches').where({ drna_station_id: 'unmapped' }).first()).toMatchObject({ nws_forecast_zone: null, nws_mapping_method: null });
    await trx('beaches').where({ drna_station_id: 'existing' }).update({ latitude: 18.5 });
    expect(await row()).toMatchObject({ nws_forecast_zone: null, nws_mapping_method: null, nws_mapping_latitude: null });
  });

  it('also validates legacy records if migrations have already been installed', async () => {
    await trx.migrate.latest({ directory, loadExtensions: ['.ts'] });
    await transitionNwsProvenance(trx, { getForecastZone: jest.fn().mockResolvedValue('PRZ001') });
    expect(operationalNwsZone(await row())).toBe('PRZ001');
  });
});
