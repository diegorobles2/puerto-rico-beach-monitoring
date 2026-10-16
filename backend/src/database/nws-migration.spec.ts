
import 'dotenv/config';
import knex, { Knex } from 'knex';
import { up, down } from './migrations/20261016190000_add_nws_persistence';

describe('NWS persistence migration', () => {
  let db: Knex;

  beforeAll(async () => {
    const connectionString = process.env.NWS_MIGRATION_TEST_DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'NWS_MIGRATION_TEST_DATABASE_URL is required',
      );
    }

    const url = new URL(connectionString);

    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== '/beach_monitoring_migration_test'
    ) {
      throw new Error(
        'Migration tests require the isolated local migration database',
      );
    }

    db = knex({
      client: 'pg',
      connection: connectionString,
    });

    const existing = await db('information_schema.tables')
      .select('table_name')
      .where({ table_schema: 'public' })
      .whereIn('table_name', [
        'nws_conditions',
        'nws_alerts',
        'nws_alert_zones',
        'nws_alert_snapshots',
        'nws_source_health',
      ]);

    if (existing.length > 0) {
      throw new Error(
        'Migration test database already contains NWS tables',
      );
    }
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
  });

  it('creates and removes all five NWS tables', async () => {
    const tables = [
      'nws_conditions',
      'nws_alerts',
      'nws_alert_zones',
      'nws_alert_snapshots',
      'nws_source_health',
    ];

    try {
      await up(db);

      for (const table of tables) {
        expect(await db.schema.hasTable(table)).toBe(true);
      }
    } finally {
      await down(db);
    }

    for (const table of tables) {
      expect(await db.schema.hasTable(table)).toBe(false);
    }
  });
});
