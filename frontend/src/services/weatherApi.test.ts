import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWeather } from './beachApi';

const valid = () => ({
  beachId: 1, availability: 'available', source: 'NWS', observedAt: '2026-11-17T00:00:00Z', retrievedAt: '2026-11-17T01:00:00Z',
  sourceUrl: 'https://api.weather.gov/gridpoints/SJU/163,132/forecast',
  forecast: { name: 'Tonight', validFrom: '2026-11-17T00:00:00Z', validTo: '2026-11-17T12:00:00Z', temperature: 81, temperatureUnit: 'F',
    windSpeed: '6 to 9 mph', windDirection: 'E', precipitationProbabilityPercent: null, shortForecast: 'Showers', detailedForecast: 'Synthetic showers.' },
});
const mock = (body: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
afterEach(() => vi.unstubAllGlobals());

describe('getWeather API boundary', () => {
  it('accepts matching normalized forecasts and passes the abort signal', async () => {
    mock(valid()); const controller = new AbortController();
    expect(await getWeather(1, controller.signal)).toEqual(valid());
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/conditions\/1\/weather$/), { signal: controller.signal });
  });
  it.each([null, {}, { ...valid(), beachId: 2 }, { ...valid(), sourceUrl: 'javascript:alert(1)' },
    { ...valid(), availability: 'unavailable', forecast: null, sourceUrl: 'javascript:alert(1)' },
    { ...valid(), forecast: { ...valid().forecast, temperatureUnit: 'K' } },
    { ...valid(), forecast: { ...valid().forecast, validTo: 'invalid' } }])('rejects malformed or mismatched response %p', async body => {
    mock(body); await expect(getWeather(1)).rejects.toThrow('Malformed');
  });
  it('rejects HTTP errors', async () => {
    mock({}, 503); await expect(getWeather(1)).rejects.toThrow('Unable to load weather forecast');
  });
});
