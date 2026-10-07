import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { Knex } from 'knex';
import { AppModule } from '../app.module';
import { DATABASE } from '../database/database.module';
import { IngestionService } from './ingestion.service';

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    await app.get(IngestionService).refresh();
    const db = app.get<Knex>(DATABASE);
    const [{ count: beaches }] = await db('beaches').count();
    const [{ count: observations }] = await db('water_quality_observations').count();
    console.log(`Ingestion complete: ${beaches} beaches, ${observations} observations`);
  } finally {
    await app.close();
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Ingestion failed');
  process.exitCode = 1;
});
