import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NwsService } from './nws.service';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('NwsService', () => {
  it('selects the newest SRF product and maps the requested zone', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(json({ '@graph': [
        { id: 'older', issuanceTime: '2026-10-14T07:56:00Z', productCode: 'SRF' },
        { id: 'newest', issuanceTime: '2026-10-14T20:08:00Z', productCode: 'SRF' },
      ] }))
      .mockResolvedValueOnce(json(fixture('surf-forecast-success.json')));

    await expect(new NwsService(fetcher).getConditions('PRZ001')).resolves.toMatchObject({ risk: 'moderate', zoneId: 'PRZ001' });
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://api.weather.gov/products/newest', {
      headers: expect.objectContaining({ Accept: 'application/geo+json', 'User-Agent': expect.stringContaining('puerto-rico-beach-monitoring') }),
      signal: expect.any(AbortSignal),
    });
  });

  it('maps active alerts and accepts a successful empty collection', async () => {
    await expect(new NwsService(jest.fn().mockResolvedValue(json(fixture('alerts-active-success.json')))).getActiveAlerts('PRZ007'))
      .resolves.toHaveLength(1);
    await expect(new NwsService(jest.fn().mockResolvedValue(json(fixture('alerts-active-empty.json')))).getActiveAlerts('PRZ007'))
      .resolves.toEqual([]);
  });

  it('rejects invalid zones before making a request', async () => {
    const fetcher = jest.fn();
    await expect(new NwsService(fetcher).getConditions('PR-7')).rejects.toThrow('Invalid NWS Puerto Rico forecast zone');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('resolves a forecast zone from NWS point metadata', async () => {
    const fetcher = jest.fn().mockResolvedValue(json({
      properties: { forecastZone: 'https://api.weather.gov/zones/forecast/PRZ001' },
    }));
    await expect(new NwsService(fetcher).getForecastZone(18.3843639, -67.2129889)).resolves.toBe('PRZ001');
  });

  it('rejects unavailable and malformed point metadata', async () => {
    await expect(new NwsService(jest.fn().mockResolvedValue(json({}, 404))).getForecastZone(18.4, -67.2))
      .rejects.toThrow('NWS point metadata returned HTTP 404');
    await expect(new NwsService(jest.fn().mockResolvedValue(json({ properties: {} }))).getForecastZone(18.4, -67.2))
      .rejects.toThrow('NWS point response has no Puerto Rico forecast zone');
  });

  it('handles transport, HTTP, malformed JSON, and malformed payload failures explicitly', async () => {
    await expect(new NwsService(jest.fn().mockRejectedValue(new Error('network'))).getActiveAlerts('PRZ007'))
      .rejects.toThrow('Unable to retrieve NWS active alerts');
    await expect(new NwsService(jest.fn().mockResolvedValue(json({}, 503))).getActiveAlerts('PRZ007'))
      .rejects.toThrow('NWS active alerts returned HTTP 503');
    await expect(new NwsService(jest.fn().mockResolvedValue(new Response('{', { status: 200 }))).getActiveAlerts('PRZ007'))
      .rejects.toThrow('NWS active alerts returned malformed JSON');
    await expect(new NwsService(jest.fn().mockResolvedValue(json(fixture('malformed-response.json')))).getActiveAlerts('PRZ007'))
      .rejects.toThrow('NWS active-alert response is malformed');
  });
});
