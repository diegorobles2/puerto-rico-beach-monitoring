import type { INestApplication } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request = require('supertest');
import { ConditionsController } from './conditions/conditions.controller';
import { ConditionsService } from './conditions/conditions.service';
import { NwsConditionsService } from './conditions/nws-conditions.service';
import { configureHttp } from './configure-http';
import { WeatherController } from './conditions/weather.controller';
import { WeatherService } from './conditions/weather.service';

describe('Public API security boundaries', () => {
  let app: INestApplication;
  const get = jest.fn();
  let previousOrigin: string | undefined;

  beforeAll(async () => {
    previousOrigin = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://beaches.example';
    const module = await Test.createTestingModule({
      controllers: [ConditionsController, WeatherController],
      providers: [
        { provide: ConditionsService, useValue: { getWaterQuality: get } },
        { provide: NwsConditionsService, useValue: { getOceanRisk: get, getAlerts: get } },
        { provide: WeatherService, useValue: { getWeather: get } },
      ],
    }).compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();
  });
  beforeEach(() => get.mockReset().mockResolvedValue({ status: 'unknown' }));
  afterAll(async () => {
    await app.close();
    if (previousOrigin === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousOrigin;
  });

  for (const category of ['water-quality', 'ocean-risk', 'alerts', 'weather']) {
    it.each(['0', '-1', '1.5', '1e2', 'Infinity', '9223372036854775808', '9007199254740993', 'RW-22', "1' OR 1=1"])(
      `rejects malformed ${category} ID %s before the service`, async (id) => {
        await request(app.getHttpServer()).get(`/conditions/${encodeURIComponent(id)}/${category}`).expect(400);
        expect(get).not.toHaveBeenCalled();
      },
    );
    it(`preserves valid and nonexistent ${category} IDs`, async () => {
      await request(app.getHttpServer()).get(`/conditions/7/${category}`).expect(200);
      expect(get).toHaveBeenLastCalledWith(7);
      await request(app.getHttpServer()).get(`/conditions/2147483648/${category}`).expect(200);
      expect(get).toHaveBeenLastCalledWith(2147483648);
      get.mockRejectedValueOnce(new NotFoundException('Beach not found'));
      await request(app.getHttpServer()).get(`/conditions/999/${category}`).expect(404);
    });
  }

  it('allows the configured frontend and anonymous public reads', async () => {
    const response = await request(app.getHttpServer()).get('/conditions/7/alerts')
      .set('Origin', 'https://beaches.example').expect(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://beaches.example');
    expect(response.headers['x-powered-by']).toBeUndefined();
    await request(app.getHttpServer()).get('/conditions/7/alerts').expect(200);
  });

  it('does not grant browser access to another origin', async () => {
    const origin = 'https://beaches.example.attacker.test';
    const response = await request(app.getHttpServer()).get('/conditions/7/alerts').set('Origin', origin).expect(200);
    // CORS restricts browsers; public HTTP reads remain available to other clients.
    expect(response.headers['access-control-allow-origin']).not.toBe(origin);
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('advertises only read methods in preflight responses', async () => {
    const response = await request(app.getHttpServer()).options('/conditions/7/alerts')
      .set('Origin', 'https://beaches.example').set('Access-Control-Request-Method', 'POST').expect(204);
    expect(response.headers['access-control-allow-methods']).toBe('GET,HEAD,OPTIONS');
    expect(get).not.toHaveBeenCalled();
  });

  it('generates the OpenAPI document with the upgraded Nest/Swagger packages', () => {
    const document = SwaggerModule.createDocument(app,
      new DocumentBuilder().setTitle('API security smoke test').setVersion('test').build());
    expect(document.paths['/conditions/{beachId}/water-quality'].get?.responses).toHaveProperty('400');
  });
});
