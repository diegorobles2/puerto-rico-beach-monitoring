import 'dotenv/config';
import knex from 'knex';
import { NwsService } from '../data-sources/nws/nws.service';
import { transitionNwsProvenance } from './nws-provenance-transition';

async function run(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const db = knex({ client: 'pg', connection: process.env.DATABASE_URL,
    pool: { min: 0, max: 5 }, acquireConnectionTimeout: 10000 });
  try {
    const result = await transitionNwsProvenance(db, new NwsService());
    console.log(`NWS provenance transition complete: ${result.validated} existing mappings independently validated`);
  } finally { await db.destroy(); }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'NWS provenance transition failed');
  process.exitCode = 1;
});
