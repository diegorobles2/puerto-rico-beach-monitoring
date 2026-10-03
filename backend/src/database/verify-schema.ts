import { deepEqual, equal, ok } from 'node:assert/strict';
import knex from 'knex';
import config from '../../knexfile';

async function verifySchema() {
  const db = knex(config);

  try {
    const tables = await db('pg_catalog.pg_class as c')
      .join('pg_catalog.pg_namespace as n', 'n.oid', 'c.relnamespace')
      .where('n.nspname', 'public')
      .whereIn('c.relname', ['beaches', 'water_quality_observations'])
      .select('c.relname', 'c.relrowsecurity');

    deepEqual(
      tables.map(({ relname }) => relname).sort(),
      ['beaches', 'water_quality_observations'],
    );
    ok(tables.every(({ relrowsecurity }) => relrowsecurity), 'RLS must be enabled on every public table');

    const foreignKey = await db.raw(`
      select 1
      from pg_constraint
      where conrelid = 'public.water_quality_observations'::regclass
        and contype = 'f'
    `);
    equal(foreignKey.rowCount, 1);

    console.log('Database schema verified: tables, RLS, and foreign key are present.');
  } finally {
    await db.destroy();
  }
}

void verifySchema();
