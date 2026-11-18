import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { WeatherController } from './weather.controller';
import { WeatherService, WEATHER_CACHE_TTL_MS, WEATHER_RETRY_MS } from './weather.service';
import { DATABASE } from '../database/database.module';
import { NwsService } from '../data-sources/nws/nws.service';
import { NwsWeatherUnavailableError } from '../data-sources/nws/nws-weather.mapper';
import type { WeatherForecast } from '../types/domain';

const initialTime = Date.parse('2026-11-17T01:00:00Z');
const forecast = (): WeatherForecast => ({
  name: 'Tonight', temperature: 81, temperatureUnit: 'F', windSpeed: '6 to 9 mph', windDirection: 'E',
  validFrom: '2026-11-17T00:00:00Z', validTo: '2026-11-17T12:00:00Z', precipitationProbabilityPercent: null,
  shortForecast: 'Synthetic showers', detailedForecast: 'Synthetic weather details.',
  source: { sourceName: 'NWS', sourceUrl: 'https://api.weather.gov/gridpoints/SJU/163,132/forecast',
    observedAt: '2026-11-17T00:00:00Z', retrievedAt: '2026-11-17T01:00:00Z' },
});

describe('Weather API and process-local cache', () => {
  let app: INestApplication;
  let service: WeatherService;
  let time: number;
  let rows: Record<number, { id: number; latitude: number | null; longitude: number }>;
  const fetchWeather = jest.fn();
  const db = jest.fn(() => {
    let id = 0;
    const query = { select: () => query, where: (filter: { id: number }) => { id = filter.id; return query; }, first: async () => rows[id] };
    return query;
  });

  beforeEach(async () => {
    time = initialTime;
    jest.spyOn(Date, 'now').mockImplementation(() => time);
    rows = { 7: { id: 7, latitude: 18.4672361, longitude: -66.0899583 }, 8: { id: 8, latitude: 18.38, longitude: -67.21 } };
    fetchWeather.mockReset().mockResolvedValue(forecast());
    db.mockClear();
    const module = await Test.createTestingModule({ controllers: [WeatherController], providers: [WeatherService,
      { provide: DATABASE, useValue: db }, { provide: NwsService, useValue: { getWeather: fetchWeather } }] }).compile();
    service = module.get(WeatherService);
    app = module.createNestApplication(); await app.init();
  });
  afterEach(async () => { await app.close(); jest.restoreAllMocks(); });

  it('serves normalized weather and reuses a cached forecast', async () => {
    const response = await request(app.getHttpServer()).get('/conditions/7/weather').expect(200);
    expect(response.body).toMatchObject({ beachId: 7, availability: 'available', source: 'NWS', forecast: { temperature: 81, temperatureUnit: 'F' } });
    expect(response.body.forecast).not.toHaveProperty('source');
    await service.getWeather(7);
    expect(fetchWeather).toHaveBeenCalledTimes(1);
    expect(fetchWeather).toHaveBeenCalledWith(18.4672361, -66.0899583);
  });

  it('coalesces simultaneous requests for the same beach', async () => {
    await Promise.all([service.getWeather(7), service.getWeather(7), service.getWeather(7)]);
    expect(fetchWeather).toHaveBeenCalledTimes(1);
  });

  it('preserves original data/timestamps as historical after failure, throttles retries, then recovers', async () => {
    const initial = await service.getWeather(7);
    time += WEATHER_CACHE_TTL_MS;
    fetchWeather.mockRejectedValue(new Error('malformed or failed upstream'));
    const stale = await service.getWeather(7);
    expect(stale).toMatchObject({ availability: 'stale', forecast: initial.forecast, retrievedAt: initial.retrievedAt, unavailableReason: 'upstream-error' });
    await service.getWeather(7); expect(fetchWeather).toHaveBeenCalledTimes(2);
    time += WEATHER_RETRY_MS;
    fetchWeather.mockResolvedValue(forecast());
    expect((await service.getWeather(7)).availability).toBe('available');
  });

  it('reports initial failure and unsupported coverage without fabricated weather', async () => {
    fetchWeather.mockRejectedValue(new NwsWeatherUnavailableError('unsupported-location'));
    const response = await request(app.getHttpServer()).get('/conditions/7/weather').expect(200);
    expect(response.body).toMatchObject({ availability: 'unavailable', forecast: null, unavailableReason: 'unsupported-location', observedAt: null, retrievedAt: null });
  });

  it('marks old issuance stale even after a fresh retrieval', async () => {
    const data = forecast(); data.source.observedAt = '2026-11-15T00:00:00Z';
    fetchWeather.mockResolvedValue(data);
    expect((await service.getWeather(7)).availability).toBe('stale');
  });

  it.each([['observedAt', 24], ['retrievedAt', 6]] as const)('rechecks the %s freshness boundary on cached reads', async (field, hours) => {
    const data = forecast();
    data.source[field] = new Date(time - hours * 60 * 60 * 1000).toISOString();
    if (field === 'retrievedAt') data.source.observedAt = new Date(time - 7 * 60 * 60 * 1000).toISOString();
    fetchWeather.mockResolvedValue(data);
    expect((await service.getWeather(7)).availability).toBe('available');
    time++;
    expect((await service.getWeather(7)).availability).toBe('stale');
    expect(fetchWeather).toHaveBeenCalledTimes(1);
  });

  it('marks expired forecasts historical on read if refresh fails', async () => {
    await service.getWeather(7);
    time = Date.parse('2026-11-17T12:00:00Z'); fetchWeather.mockRejectedValue(new Error('offline'));
    expect((await service.getWeather(7)).availability).toBe('stale');
  });

  it('keeps beaches isolated and discards a cached forecast if coordinates change', async () => {
    await service.getWeather(7);
    fetchWeather.mockRejectedValue(new Error('offline'));
    expect((await service.getWeather(8)).forecast).toBeNull();
    rows[7].latitude = 18.5;
    expect((await service.getWeather(7)).forecast).toBeNull();
  });

  it('refreshes only previously requested beaches on the scheduler path', async () => {
    expect(await service.refreshCached()).toEqual({ attempted: 0, failed: 0 });
    await service.getWeather(7);
    expect(await service.refreshCached()).toEqual({ attempted: 1, failed: 0 });
    expect(fetchWeather).toHaveBeenCalledTimes(2);
  });

  it('returns 404 for unknown beaches and 400 for unsafe IDs before a lookup', async () => {
    await request(app.getHttpServer()).get('/conditions/999/weather').expect(404);
    db.mockClear();
    await request(app.getHttpServer()).get('/conditions/9007199254740993/weather').expect(400);
    expect(db).not.toHaveBeenCalled();
  });
});
