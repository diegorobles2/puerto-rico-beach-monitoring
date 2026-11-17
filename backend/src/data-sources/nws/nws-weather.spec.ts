import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NwsService } from './nws.service';
import { mapNwsWeather, NwsWeatherUnavailableError } from './nws-weather.mapper';

const now = '2026-11-17T01:00:00Z';
const url = 'https://api.weather.gov/gridpoints/SJU/163,132/forecast';
const payload = () => JSON.parse(readFileSync(join(__dirname, 'fixtures/weather-success.json'), 'utf8'));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('NWS weather normalization and exact-point mapping', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date(now)));
  afterEach(() => jest.useRealTimers());

  it('follows the point mapping and preserves issuance, retrieval, units, and valid period', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(json({ properties: { forecast: url } })).mockResolvedValueOnce(json(payload()));
    const result = await new NwsService(fetcher).getWeather(18.4672361, -66.0899583);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['https://api.weather.gov/points/18.4672361,-66.0899583', url]);
    expect(result).toMatchObject({ temperature: 81, temperatureUnit: 'F', windSpeed: '6 to 9 mph', precipitationProbabilityPercent: 30,
      source: { sourceUrl: url, observedAt: '2026-11-17T00:00:00.000Z', retrievedAt: '2026-11-17T01:00:00.000Z' } });
    expect(result).not.toHaveProperty('risk');
  });

  it.each([404, 200])('reports unsupported point coverage (%s) without a guessed fallback', async status => {
    const fetcher = jest.fn().mockResolvedValue(json({ properties: { forecast: null } }, status));
    await expect(new NwsService(fetcher).getWeather(18.4, -67.2)).rejects.toMatchObject({ reason: 'unsupported-location' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['http://api.weather.gov/gridpoints/SJU/1,1/forecast', 'https://attacker.test/forecast',
    'https://api.weather.gov/gridpoints/LWX/1,1/forecast', 'https://api.weather.gov/gridpoints/SJU/1,1/forecast/../../alerts'])(
    'never follows an untrusted or foreign mapping %s', async forecast => {
    const fetcher = jest.fn().mockResolvedValue(json({ properties: { forecast } }));
    await expect(new NwsService(fetcher).getWeather(18.4, -67.2)).rejects.toThrow('forecast URL');
    expect(fetcher).toHaveBeenCalledTimes(1);
    });

  it('rejects invalid coordinates without a request', async () => {
    const fetcher = jest.fn();
    await expect(new NwsService(fetcher).getWeather(NaN, -67)).rejects.toBeInstanceOf(NwsWeatherUnavailableError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([null, [], 'bad', {}, { properties: { updateTime: now, periods: 'bad' } }])('rejects malformed forecast %p', value => {
    expect(() => mapNwsWeather(value, url, now)).toThrow();
  });

  it.each([
    { temperature: null }, { temperatureUnit: 'K' }, { endTime: 'invalid' }, { endTime: '2026-11-16T00:00:00Z' },
    { windSpeed: null }, { probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: 101 } },
  ])('rejects malformed period fields %p', override => {
    const data = payload(); Object.assign(data.properties.periods[0], override);
    expect(() => mapNwsWeather(data, url, now)).toThrow('malformed');
  });

  it('does not replace missing precipitation probability with zero', () => {
    const data = payload(); data.properties.periods[0].probabilityOfPrecipitation.value = null;
    expect(mapNwsWeather(data, url, now).precipitationProbabilityPercent).toBeNull();
  });

  it('rejects future issuance and explicitly reports a missing active forecast', () => {
    const data = payload(); data.properties.updateTime = '2026-11-18T00:00:00Z';
    expect(() => mapNwsWeather(data, url, now)).toThrow('issuance');
    expect(() => mapNwsWeather(payload(), url, '2026-11-17T12:00:00Z')).toThrow(NwsWeatherUnavailableError);
  });

  it('handles timeouts and HTTP/JSON failures without returning invented forecasts', async () => {
    await expect(new NwsService(jest.fn().mockRejectedValue(new Error('timeout'))).getWeather(18.4, -67.2)).rejects.toThrow('Unable to retrieve');
    await expect(new NwsService(jest.fn().mockResolvedValue(json({}, 503))).getWeather(18.4, -67.2)).rejects.toThrow('HTTP 503');
    await expect(new NwsService(jest.fn().mockResolvedValue(new Response('{'))).getWeather(18.4, -67.2)).rejects.toThrow('malformed JSON');
  });
});
