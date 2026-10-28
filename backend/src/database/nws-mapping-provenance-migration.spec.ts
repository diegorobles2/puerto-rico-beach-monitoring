import 'dotenv/config';
import knex, { type Knex } from 'knex';
import { up as addForecastZone } from './migrations/20261015010240_add_nws_forecast_zone';
import { up, down } from './migrations/20261025230000_add_nws_mapping_provenance';

const connectionString = process.env.NWS_MIGRATION_TEST_DATABASE_URL;
const describeDatabase = isExpectedDatabase(connectionString) ? describe : describe.skip;

type Provenance = {
  nws_forecast_zone: string | null;
  nws_mapping_method: string | null;
  nws_mapping_latitude: number | null;
  nws_mapping_longitude: number | null;
  nws_mapping_registry_version: string | null;
  nws_mapping_error?: string | null;
};
const unmapped: Provenance = {
  nws_forecast_zone: null, nws_mapping_method: null,
  nws_mapping_latitude: null, nws_mapping_longitude: null, nws_mapping_registry_version: null,
};
const automatic: Provenance = {
  ...unmapped, nws_forecast_zone: 'PRZ011', nws_mapping_method: 'automatic',
  nws_mapping_latitude: 17.9747944, nws_mapping_longitude: -67.2129056,
};
const fallback: Provenance = { ...automatic, nws_mapping_method: 'verified-fallback', nws_mapping_registry_version: '2026-10-25.v1' };

// No application database is used. All fixture DDL/DML is rolled back per test.
describeDatabase('NWS mapping provenance migration (PostgreSQL)', () => {
  let db: Knex;
  let trx: Knex.Transaction | undefined;
  const originalRows = [
    { drna_station_id: 'mapped', name: 'Mapped', municipality: 'Test', latitude: 18.4, longitude: -66.1, nws_forecast_zone: 'PRZ001', nws_mapping_error: null },
    { drna_station_id: 'unmapped', name: 'Unmapped', municipality: 'Test', latitude: 18.3, longitude: -66.2, nws_forecast_zone: null, nws_mapping_error: 'Point unavailable' },
    { drna_station_id: 'no-coordinates', name: 'Historical', municipality: 'Test', latitude: null, longitude: null, nws_forecast_zone: 'PRZ005', nws_mapping_error: null },
  ];

  beforeAll(async () => {
    db = knex({ client: 'pg', connection: connectionString!, pool: { min: 0, max: 1 }, acquireConnectionTimeout: 10000 });
    if (await db.schema.withSchema('public').hasTable('beaches')) {
      throw new Error('Migration test database already contains public.beaches; refusing to alter it');
    }
  });

  beforeEach(async () => {
    trx = await db.transaction();
    // Minimal pre-NWS beaches fixture; apply the actual existing forecast-zone migration.
    await trx.raw(`
      create table public.beaches (
        id bigint generated always as identity primary key,
        drna_station_id text not null unique, name text not null, municipality text not null,
        latitude double precision check (latitude between -90 and 90),
        longitude double precision check (longitude between -180 and 180)
      );
    `);
    await addForecastZone(trx);
    await trx('public.beaches').insert(originalRows);
    await up(trx);
  });

  afterEach(async () => { if (trx) { await trx.rollback(); trx = undefined; } });
  afterAll(async () => { if (db) await db.destroy(); });

  it('preserves zones, coordinates and errors while marking only mapped rows legacy', async () => {
    const rows = await trx!('public.beaches').select('*').orderBy('id');
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i]).toMatchObject({
        ...originalRows[i],
        nws_mapping_method: originalRows[i].nws_forecast_zone ? 'legacy' : null,
        nws_mapping_latitude: null, nws_mapping_longitude: null, nws_mapping_registry_version: null,
      });
    }
    expect(rows).toHaveLength(3);
  });

  it.each([
    ['unmapped', { ...unmapped, nws_mapping_error: 'Unsupported point' }],
    ['legacy', { ...unmapped, nws_forecast_zone: 'PRZ001', nws_mapping_method: 'legacy' }],
    ['automatic', automatic], ['verified fallback', fallback],
  ] as const)('accepts valid %s provenance', async (_name, provenance) => {
    await trx!('public.beaches').insert({ drna_station_id: 'new', name: 'New', municipality: 'Test', ...provenance });
    expect(await trx!('public.beaches').where({ drna_station_id: 'new' }).first()).toMatchObject(provenance);
  });

  const invalid: Array<[string, Provenance, string]> = [
    ['zone without method (SQL NULL must not pass)', { ...unmapped, nws_forecast_zone: 'PRZ011' }, 'beaches_nws_mapping_provenance_check'],
    ['unknown method', { ...automatic, nws_mapping_method: 'guessed' }, 'beaches_nws_mapping_provenance_check'],
    ['method without zone', { ...automatic, nws_forecast_zone: null }, 'beaches_nws_mapping_provenance_check'],
    ['unmapped coordinates', { ...unmapped, nws_mapping_latitude: 18 }, 'beaches_nws_mapping_provenance_check'],
    ['unmapped version', { ...unmapped, nws_mapping_registry_version: 'v1' }, 'beaches_nws_mapping_provenance_check'],
    ['legacy fabricated coordinates', { ...automatic, nws_mapping_method: 'legacy' }, 'beaches_nws_mapping_provenance_check'],
    ['legacy version', { ...fallback, nws_mapping_method: 'legacy' }, 'beaches_nws_mapping_provenance_check'],
    ['automatic missing latitude', { ...automatic, nws_mapping_latitude: null }, 'beaches_nws_mapping_provenance_check'],
    ['automatic missing longitude', { ...automatic, nws_mapping_longitude: null }, 'beaches_nws_mapping_provenance_check'],
    ['automatic version', { ...fallback, nws_mapping_method: 'automatic' }, 'beaches_nws_mapping_provenance_check'],
    ['fallback missing latitude', { ...fallback, nws_mapping_latitude: null }, 'beaches_nws_mapping_provenance_check'],
    ['fallback missing longitude', { ...fallback, nws_mapping_longitude: null }, 'beaches_nws_mapping_provenance_check'],
    ['fallback missing version', { ...fallback, nws_mapping_registry_version: null }, 'beaches_nws_mapping_provenance_check'],
    ['fallback empty version', { ...fallback, nws_mapping_registry_version: '' }, 'beaches_nws_mapping_provenance_check'],
    ['fallback whitespace version', { ...fallback, nws_mapping_registry_version: ' \t\n' }, 'beaches_nws_mapping_provenance_check'],
    ['latitude below range', { ...automatic, nws_mapping_latitude: -91 }, 'beaches_nws_mapping_latitude_check'],
    ['latitude above range', { ...automatic, nws_mapping_latitude: 91 }, 'beaches_nws_mapping_latitude_check'],
    ['longitude below range', { ...automatic, nws_mapping_longitude: -181 }, 'beaches_nws_mapping_longitude_check'],
    ['longitude above range', { ...automatic, nws_mapping_longitude: 181 }, 'beaches_nws_mapping_longitude_check'],
    ['NaN latitude', { ...automatic, nws_mapping_latitude: NaN }, 'beaches_nws_mapping_latitude_check'],
    ['infinite longitude', { ...automatic, nws_mapping_longitude: Infinity }, 'beaches_nws_mapping_longitude_check'],
    ['zone format', { ...automatic, nws_forecast_zone: 'AMZ745' }, 'beaches_nws_forecast_zone_check'],
    ['zone with error', { ...automatic, nws_mapping_error: 'Failed' }, 'beaches_nws_mapping_state_check'],
  ];
  it.each(invalid)('rejects %s', async (_name, provenance, constraint) => {
    await expect(trx!('public.beaches').insert({ drna_station_id: 'invalid', name: 'Invalid', municipality: 'Test', ...provenance }))
      .rejects.toMatchObject({ code: '23514', constraint });
  });

  it('enforces provenance constraints on updates as well as inserts', async () => {
    await expect(trx!('public.beaches').where({ drna_station_id: 'mapped' }).update({ nws_mapping_method: 'automatic' }))
      .rejects.toMatchObject({ code: '23514', constraint: 'beaches_nws_mapping_provenance_check' });
  });

  it('rolls back provenance only and supports applying the migration again', async () => {
    await trx!('public.beaches').insert({ drna_station_id: 'fallback', name: 'Fallback', municipality: 'Test', latitude: 18, longitude: -67, ...fallback });
    const before = await trx!('public.beaches').select('drna_station_id', 'latitude', 'longitude', 'nws_forecast_zone', 'nws_mapping_error').orderBy('id');
    await down(trx!);
    expect(await trx!('public.beaches').select('drna_station_id', 'latitude', 'longitude', 'nws_forecast_zone', 'nws_mapping_error').orderBy('id')).toEqual(before);
    for (const column of ['nws_mapping_method', 'nws_mapping_latitude', 'nws_mapping_longitude', 'nws_mapping_registry_version']) {
      expect(await trx!.schema.withSchema('public').hasColumn('beaches', column)).toBe(false);
    }
    const constraints = await trx!('pg_constraint').select('conname').whereRaw("conrelid = 'public.beaches'::regclass");
    expect(constraints.map(row => row.conname)).toEqual(expect.arrayContaining(['beaches_nws_forecast_zone_check', 'beaches_nws_mapping_state_check']));
    await up(trx!);
    expect(await trx!('public.beaches').whereNotNull('nws_forecast_zone').select('nws_mapping_method'))
      .toEqual(Array(3).fill({ nws_mapping_method: 'legacy' }));
  });
});

function isExpectedDatabase(connection: string | undefined): boolean {
  if (!connection) return false;
  try {
    const url = new URL(connection);
    return ['postgres:', 'postgresql:'].includes(url.protocol)
      && ['localhost', '127.0.0.1'].includes(url.hostname)
      && url.pathname === '/beach_monitoring_migration_test';
  } catch { return false; }
}
