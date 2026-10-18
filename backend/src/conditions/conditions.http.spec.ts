import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { DATABASE } from '../database/database.module';
import { ConditionsController } from './conditions.controller';
import { ConditionsService } from './conditions.service';
import { NwsConditionsService } from './nws-conditions.service';

// Shaped like the row IngestionService stores for the RW-22 fixture record of 21-Sep-2026.
const RW22_OBSERVATION = {
  status: 'advisory',
  sampled_at: new Date(2026, 8, 21),
  retrieved_at: new Date('2026-10-07T12:00:00.000Z'),
  source_url: 'https://www.drna.pr.gov/wp-content/uploads/2026/09/Monitoria-de-playas-25-de-Septiembre-de-2026.pdf',
  enterococcus_value: 231,
  enterococcus_qualifier: null,
  sampling_type: 'routine',
  temperature_celsius: '29.0',
  ph: '8.19',
};

function createDb(beach: { id: number } | undefined, observation: typeof RW22_OBSERVATION | undefined) {
  return jest.fn((table: string) => {
    const query = { where: jest.fn(), orderBy: jest.fn(), first: jest.fn() };
    query.where.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.first.mockResolvedValue(table === 'beaches' ? beach : observation);
    return query;
  });
}

describe('GET /conditions/:beachId/water-quality', () => {
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

  it('returns the normalized status and provenance of the latest observation', async () => {
    await start(createDb({ id: 7 }, RW22_OBSERVATION));

    const response = await request(app.getHttpServer()).get('/conditions/7/water-quality').expect(200);

    expect(response.body).toEqual({
      status: 'advisory',
      source: 'DRNA',
      sourceUrl: RW22_OBSERVATION.source_url,
      observedAt: '2026-09-21',
      retrievedAt: '2026-10-07T12:00:00.000Z',
      availability: 'available',
      enterococcusValue: 231,
      enterococcusQualifier: null,
      samplingType: 'routine',
      temperatureCelsius: 29,
      ph: 8.19,
    });
  });

  it('reports unavailable data as unknown rather than suitable', async () => {
    await start(createDb({ id: 7 }, undefined));

    const response = await request(app.getHttpServer()).get('/conditions/7/water-quality').expect(200);

    expect(response.body).toEqual({
      status: 'unknown',
      source: 'DRNA',
      observedAt: null,
      retrievedAt: null,
      availability: 'unavailable',
    });
  });

  it('returns 404 for a beach that does not exist', async () => {
    await start(createDb(undefined, undefined));

    await request(app.getHttpServer()).get('/conditions/999/water-quality').expect(404);
  });

  it('returns 400 for a non-numeric beach identifier', async () => {
    const db = createDb({ id: 7 }, RW22_OBSERVATION);
    await start(db);

    await request(app.getHttpServer()).get('/conditions/RW-22/water-quality').expect(400);
    expect(db).not.toHaveBeenCalled();
  });
});
