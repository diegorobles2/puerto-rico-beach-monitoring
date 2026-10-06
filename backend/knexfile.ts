import 'dotenv/config';
import type { Knex } from 'knex';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const config: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 0, max: 5 },
  acquireConnectionTimeout: 10000,
  migrations: {
    directory: './src/database/migrations',
    extension: 'ts',
  },
};

export default config;
