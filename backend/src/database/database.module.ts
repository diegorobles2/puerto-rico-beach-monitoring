import 'dotenv/config';
import { Global, Module } from '@nestjs/common';
import knex from 'knex';

export const DATABASE = Symbol('DATABASE');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: () => {
        if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
        return knex({
          client: 'pg',
          connection: { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 },
          acquireConnectionTimeout: 3000,
          pool: { min: 0, max: 5 },
        });
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
