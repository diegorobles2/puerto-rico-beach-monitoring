import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { DATABASE } from '../database/database.module';
import { DrnaService } from '../data-sources/drna/drna.service';
import { NwsService } from '../data-sources/nws/nws.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { NwsIngestionService } from '../ingestion/nws-ingestion.service';
import { ConditionsController } from './conditions.controller';
import { ConditionsService } from './conditions.service';
import { NwsConditionsService } from './nws-conditions.service';

const failures: [string, () => Promise<Response>][] = [
  ['timeout', async () => { throw new DOMException('timed out', 'TimeoutError'); }],
  ['HTTP 404', async () => new Response('', { status: 404 })],
  ['HTTP 503', async () => new Response('', { status: 503 })],
  ['malformed content', async () => new Response('{')],
  ['malformed payload', async () => new Response(JSON.stringify({ unexpected: true }))],
];

describe('Source failures through ingestion and public reads', () => {
  let app: INestApplication;
  afterEach(async () => app?.close());

  it.each(failures)('keeps the API usable with historical data after %s', async (_label, fetcher) => {
    const observedAt = '2026-09-21';
    const retrievedAt = new Date(Date.now() - 60000).toISOString();
    const rows: Record<string, unknown> = {
      beaches: { id: 7, nws_forecast_zone: 'PRZ001' },
      water_quality_observations: {
        status: 'advisory', sampled_at: observedAt, retrieved_at: retrievedAt,
        source_url: 'https://example.invalid/drna.pdf', enterococcus_value: 231,
        enterococcus_qualifier: null, sampling_type: 'routine', temperature_celsius: null, ph: null,
      },
      nws_conditions: {
        risk: 'low', summary: 'Low risk', forecast_period: 'TODAY',
        source_url: 'https://example.invalid/srf', observed_at: retrievedAt, retrieved_at: retrievedAt,
      },
      nws_alert_snapshots: { retrieved_at: retrievedAt },
    };
    const health: Record<string, unknown> = {};
    const db = Object.assign(jest.fn((table: string) => {
      let sourceKey = '';
      const query: Record<string, jest.Mock> = {
        where: jest.fn((value: { source_key?: string }) => { sourceKey = value?.source_key ?? sourceKey; return query; }),
        orderBy: jest.fn(() => query), join: jest.fn(() => query),
        first: jest.fn(async () => table === 'nws_source_health' ? health[sourceKey] : rows[table]),
        select: jest.fn(async () => []),
      };
      return query;
    }), { transaction: jest.fn() });
    const persistence = {
      saveCondition: jest.fn(), saveAlerts: jest.fn(),
      recordRetrieval: jest.fn(async (source: string, _zone: string, succeeded: boolean, at: string) => {
        health[source] = { last_attempt_succeeded: succeeded, last_attempt_at: at };
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [ConditionsController],
      providers: [ConditionsService, NwsConditionsService, { provide: DATABASE, useValue: db }],
    }).compile();
    app = module.createNestApplication();
    await app.init();

    const before = await request(app.getHttpServer()).get('/conditions/7/ocean-risk').expect(200);
    expect(before.body).toMatchObject({ status: 'low', availability: 'available' });
    const nws = new NwsIngestionService(new NwsService(fetcher), persistence as never);
    await expect(nws.refreshConditions('PRZ001')).rejects.toThrow();
    await expect(nws.refreshAlerts('PRZ001')).rejects.toThrow();
    const drna = new IngestionService(new DrnaService(fetcher), db as never);
    await expect(drna.refresh()).rejects.toThrow();

    expect(persistence.saveCondition).not.toHaveBeenCalled();
    expect(persistence.saveAlerts).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    const risk = await request(app.getHttpServer()).get('/conditions/7/ocean-risk').expect(200);
    expect(risk.body).toMatchObject({ status: 'unknown', lastKnownStatus: 'low', availability: 'stale', retrievedAt });
    const alerts = await request(app.getHttpServer()).get('/conditions/7/alerts').expect(200);
    expect(alerts.body).toMatchObject({ status: 'unknown', availability: 'stale', alerts: [], retrievedAt });
    const water = await request(app.getHttpServer()).get('/conditions/7/water-quality').expect(200);
    expect(water.body).toMatchObject({ status: 'unknown', lastKnownStatus: 'advisory', availability: 'stale', observedAt, retrievedAt });
  });
});
