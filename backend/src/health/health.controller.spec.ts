import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { DATABASE } from '../database/database.module';
import { HealthController } from './health.controller';

describe('Health endpoints', () => {
  let app: INestApplication;
  const timeout = jest.fn();
  const raw = jest.fn().mockReturnValue({ timeout });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DATABASE, useValue: { raw } }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('reports liveness without querying the database', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
    expect(raw).not.toHaveBeenCalled();
  });

  it('reports readiness after a bounded database query', async () => {
    timeout.mockResolvedValueOnce({ rows: [] });
    await request(app.getHttpServer()).get('/health/ready').expect(200, { status: 'ready' });
    expect(raw).toHaveBeenCalledWith('select 1');
    expect(timeout).toHaveBeenCalledWith(2000);
  });

  it('returns 503 without exposing database errors while remaining live', async () => {
    timeout.mockRejectedValueOnce(new Error('secret connection details'));
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(response.body.message).toBe('Database is not ready');
    expect(response.text).not.toContain('secret');
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });
});
