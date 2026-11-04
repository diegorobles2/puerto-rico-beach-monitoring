import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { Knex } from 'knex';
import { AppModule } from '../app.module';
import { DATABASE } from '../database/database.module';
import { NwsIngestionService } from './nws-ingestion.service';

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const db = app.get<Knex>(DATABASE);
    const zones = await db('beaches').distinct('nws_forecast_zone').whereNotNull('nws_forecast_zone');
    const result = await app.get(NwsIngestionService).refreshZones(zones.map((row) => row.nws_forecast_zone));
    console.log(`NWS ingestion complete: ${result.attempted - result.failed}/${result.attempted} requests saved`);
    if (result.failed) throw new Error(`${result.failed} NWS ingestion requests failed`);
  } finally {
    await app.close();
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'NWS ingestion failed');
  process.exitCode = 1;
});
