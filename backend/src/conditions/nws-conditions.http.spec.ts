import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { DATABASE } from '../database/database.module';
import { ConditionsController } from './conditions.controller';
import { ConditionsService } from './conditions.service';
import { NwsConditionsService } from './nws-conditions.service';

const MINUTE_MS = 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

interface Rows {
  beach?: { id: number; nws_forecast_zone: string | null };
  condition?: Record<string, unknown>;
  snapshot?: { retrieved_at: Date };
  health?: { last_attempt_at: Date; last_attempt_succeeded: boolean };
  alerts?: Record<string, unknown>[];
}

function createDb(rows: Rows) {
  return jest.fn((table: string) => {
    const query: Record<string, jest.Mock> = {
      where: jest.fn(() => query),
      join: jest.fn(() => query),
      orderBy: jest.fn(() => query),
      first: jest.fn(async () =>
        table === 'beaches' ? rows.beach
          : table === 'nws_conditions' ? rows.condition
            : table === 'nws_alert_snapshots' ? rows.snapshot
              : rows.health),
      select: jest.fn(async () => rows.alerts ?? []),
    };
    return query;
  });
}

const BEACH = { id: 7, nws_forecast_zone: 'PRZ001' };

describe('NWS condition endpoints', () => {
  let app: INestApplication;

  async function start(db: ReturnType<typeof createDb>) {
    const module = await Test.createTestingModule({
      controllers: [ConditionsController],
      providers: [ConditionsService, NwsConditionsService, { provide: DATABASE, useValue: db }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  }

  afterEach(async () => app?.close());

  describe('GET /conditions/:beachId/ocean-risk', () => {
    it('returns the normalized risk without raw NWS fields', async () => {
      const retrievedAt = ago(10 * MINUTE_MS);
      const observedAt = ago(2 * 60 * MINUTE_MS);
      await start(createDb({
        beach: BEACH,
        condition: {
          forecast_period: 'TODAY',
          risk: 'high',
          summary: 'High rip-current risk.',
          source_url: 'https://api.weather.gov/products/srf-1',
          observed_at: observedAt,
          retrieved_at: retrievedAt,
        },
      }));

      const response = await request(app.getHttpServer()).get('/conditions/7/ocean-risk').expect(200);

      expect(response.body).toEqual({
        beachId: 7,
        zoneId: 'PRZ001',
        status: 'high',
        summary: 'High rip-current risk.',
        forecastPeriod: 'TODAY',
        source: 'NWS',
        sourceUrl: 'https://api.weather.gov/products/srf-1',
        observedAt: observedAt.toISOString(),
        retrievedAt: retrievedAt.toISOString(),
        availability: 'available',
      });
    });

    it('reports missing data as unknown rather than low', async () => {
      await start(createDb({ beach: BEACH }));

      const response = await request(app.getHttpServer()).get('/conditions/7/ocean-risk').expect(200);

      expect(response.body).toMatchObject({
        status: 'unknown',
        availability: 'unavailable',
        unavailableReason: 'no-data',
      });
    });

    it('returns 404 for a beach that does not exist', async () => {
      await start(createDb({}));

      await request(app.getHttpServer()).get('/conditions/999/ocean-risk').expect(404);
    });

    it('returns 400 for a non-numeric beach identifier', async () => {
      const db = createDb({ beach: BEACH });
      await start(db);

      await request(app.getHttpServer()).get('/conditions/RW-22/ocean-risk').expect(400);
      expect(db).not.toHaveBeenCalled();
    });
  });

  describe('GET /conditions/:beachId/alerts', () => {
    it('returns an empty list for a current check that found no alerts', async () => {
      const retrievedAt = ago(5 * MINUTE_MS);
      await start(createDb({ beach: BEACH, snapshot: { retrieved_at: retrievedAt }, alerts: [] }));

      const response = await request(app.getHttpServer()).get('/conditions/7/alerts').expect(200);

      expect(response.body).toEqual({
        beachId: 7,
        zoneId: 'PRZ001',
        status: 'no-active-alerts',
        source: 'NWS',
        retrievedAt: retrievedAt.toISOString(),
        availability: 'available',
        alerts: [],
      });
    });

    it('returns null alerts when alerts were never retrieved', async () => {
      await start(createDb({ beach: BEACH }));

      const response = await request(app.getHttpServer()).get('/conditions/7/alerts').expect(200);

      expect(response.body).toMatchObject({
        status: 'unknown',
        availability: 'unavailable',
        unavailableReason: 'no-data',
        alerts: null,
      });
    });

    it('returns 404 for a beach that does not exist', async () => {
      await start(createDb({}));

      await request(app.getHttpServer()).get('/conditions/999/alerts').expect(404);
    });
  });
});
