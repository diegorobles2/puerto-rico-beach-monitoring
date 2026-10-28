import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NwsService } from './nws.service';
import { NwsError, NwsHttpError, NwsInvalidCoordinatesError, NwsInvalidResponseError, NwsInvalidZoneError, NwsMarinePointError, NwsTransportError } from './nws.errors';

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

  it('preserves the product URL and issuance/retrieval timestamps', async () => {
    const retrievedAt = new Date('2026-10-15T01:00:00.000Z');
    jest.useFakeTimers().setSystemTime(retrievedAt);
    const fetcher = jest.fn()
      .mockResolvedValueOnce(json({ '@graph': [
        { id: 'newest', issuanceTime: '2026-10-14T20:08:00Z', productCode: 'SRF' },
      ] }))
      .mockResolvedValueOnce(json(fixture('surf-forecast-success.json')));

    try {
      await expect(new NwsService(fetcher).getConditions('PRZ001')).resolves.toMatchObject({
        source: {
          sourceName: 'NWS',
          sourceUrl: 'https://api.weather.gov/products/newest',
          observedAt: '2026-10-14T20:08:00.000Z',
          retrievedAt: retrievedAt.toISOString(),
        },
      });
    } finally {
      jest.useRealTimers();
    }
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

  it('treats a timeout as a failed retrieval', async () => {
    const timeout = new DOMException('The operation timed out', 'TimeoutError');
    const fetcher = jest.fn().mockRejectedValue(timeout);

    await expect(new NwsService(fetcher).getActiveAlerts('PRZ007'))
      .rejects.toThrow('Unable to retrieve NWS active alerts');
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.weather.gov/alerts/active?zone=PRZ007',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('rejects malformed surf index and product payloads', async () => {
    const malformedIndex = new NwsService(jest.fn().mockResolvedValue(json({ '@graph': 'not-an-array' })));
    await expect(malformedIndex.getConditions('PRZ001'))
      .rejects.toThrow('NWS surf forecast index is malformed');

    const malformedProduct = new NwsService(jest.fn()
      .mockResolvedValueOnce(json({ '@graph': [
        { id: 'newest', issuanceTime: '2026-10-14T20:08:00Z', productCode: 'SRF' },
      ] }))
      .mockResolvedValueOnce(json({ productCode: 'SRF', productText: null, issuanceTime: '2026-10-14T20:08:00Z' })));
    await expect(malformedProduct.getConditions('PRZ001'))
      .rejects.toThrow('NWS surf forecast is malformed');
  });
});

describe('NwsService typed point errors', () => {
  const latitude = 17.9747944;
  const longitude = -67.2129056;
  const pointUrl = `https://api.weather.gov/points/${latitude},${longitude}`;
  const point = (forecastZone: unknown) => json({ properties: { forecastZone } });

  it.each(['https://api.weather.gov/zones/forecast/PRZ011', 'https://api.weather.gov:443/zones/forecast/PRZ011/'])(
    'preserves the string success interface for %s', async url => {
      await expect(new NwsService(jest.fn().mockResolvedValue(point(url))).getForecastZone(latitude, longitude))
        .resolves.toBe('PRZ011');
    },
  );

  it.each(['AMZ712', 'AMZ745'])('exposes original coordinates and marine zone for %s', async zone => {
    const error = await new NwsService(jest.fn().mockResolvedValue(point(`https://api.weather.gov/zones/forecast/${zone}`)))
      .getForecastZone(latitude, longitude).catch(error => error);
    expect(error).toBeInstanceOf(NwsError);
    expect(error).toBeInstanceOf(NwsMarinePointError);
    expect(error).toMatchObject({ code: 'unsupported-marine-point', fallbackEligible: true, marineZone: zone, latitude, longitude, sourceUrl: pointUrl });
  });

  it.each([
    [404, 'not-found', false], [429, 'rate-limited', true],
    [500, 'upstream-unavailable', true], [503, 'upstream-unavailable', true],
    [599, 'upstream-unavailable', true], [403, 'http-error', false], [400, 'http-error', false],
  ] as const)('classifies HTTP %s without allowing fallback', async (status, code, retryable) => {
    // Even a marine-looking HTTP error body cannot authorize a fallback.
    const error = await new NwsService(jest.fn().mockResolvedValue(json({ properties: { forecastZone: 'https://api.weather.gov/zones/forecast/AMZ745' } }, status)))
      .getForecastZone(latitude, longitude).catch(error => error);
    expect(error).toBeInstanceOf(NwsHttpError);
    expect(error).toMatchObject({ code, status, retryable, fallbackEligible: false, sourceUrl: pointUrl });
  });

  it.each([
    [new TypeError('fetch failed'), 'network'],
    [new DOMException('Timed out', 'TimeoutError'), 'timeout'],
  ] as const)('classifies transport failure %s', async (failure, code) => {
    const error = await new NwsService(jest.fn().mockRejectedValue(failure)).getForecastZone(latitude, longitude).catch(error => error);
    expect(error).toBeInstanceOf(NwsTransportError);
    expect(error).toMatchObject({ code, fallbackEligible: false, sourceUrl: pointUrl });
  });

  it('recognizes an aborted timeout signal even when fetch throws a generic abort error', async () => {
    const controller = new AbortController();
    controller.abort();
    const spy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    try {
      const error = await new NwsService(jest.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')))
        .getForecastZone(latitude, longitude).catch(error => error);
      expect(error).toMatchObject({ code: 'timeout', fallbackEligible: false });
    } finally { spy.mockRestore(); }
  });

  it.each([
    'https://example.com/zones/forecast/PRZ011', 'https://example.com/zones/forecast/AMZ745',
    'http://api.weather.gov/zones/forecast/PRZ011', 'https://api.weather.gov.evil.test/zones/forecast/AMZ745',
    'https://api.weather.gov@evil.test/zones/forecast/AMZ745', 'https://user:pass@api.weather.gov/zones/forecast/AMZ745',
    'https://api.weather.gov:8443/zones/forecast/AMZ745', '/zones/forecast/AMZ745',
    'https://api.weather.gov/zones/forecast/AMZ745?other=1', 'https://api.weather.gov/zones/forecast/PRZ011#fragment',
    'https://api.weather.gov/zones/county/PRZ011', 'https://api.weather.gov/zones/forecast/FLZ001',
    'https://api.weather.gov/zones/forecast/PRZ11', 'https://api.weather.gov/zones/forecast/AMZ745/extra',
  ])('rejects noncanonical or nonofficial forecast-zone URL %s', async url => {
    const error = await new NwsService(jest.fn().mockResolvedValue(point(url))).getForecastZone(latitude, longitude).catch(error => error);
    expect(error).toBeInstanceOf(NwsInvalidResponseError);
    expect(error).toMatchObject({ code: 'invalid-response', fallbackEligible: false, sourceUrl: pointUrl });
  });

  it.each([null, [], 42, 'bad', {}, { properties: null }, { properties: [] }, { properties: { forecastZone: 7 } }])(
    'classifies malformed point payload %j', async body => {
      const error = await new NwsService(jest.fn().mockResolvedValue(json(body))).getForecastZone(latitude, longitude).catch(error => error);
      expect(error).toBeInstanceOf(NwsInvalidResponseError);
      expect(error).toMatchObject({ code: 'invalid-response', fallbackEligible: false });
    },
  );

  it('classifies malformed JSON separately from a response body transport failure', async () => {
    const malformed = await new NwsService(jest.fn().mockResolvedValue(new Response('{', { status: 200 })))
      .getForecastZone(latitude, longitude).catch(error => error);
    expect(malformed).toBeInstanceOf(NwsInvalidResponseError);
    expect(malformed).toMatchObject({ code: 'invalid-response', fallbackEligible: false });
    const brokenBody = new Response('{}');
    jest.spyOn(brokenBody, 'json').mockRejectedValue(new TypeError('Connection terminated'));
    const transport = await new NwsService(jest.fn().mockResolvedValue(brokenBody))
      .getForecastZone(latitude, longitude).catch(error => error);
    expect(transport).toBeInstanceOf(NwsTransportError);
    expect(transport).toMatchObject({ code: 'network', fallbackEligible: false });
  });

  it('classifies a timeout while reading the response body', async () => {
    const response = new Response('{}');
    jest.spyOn(response, 'json').mockRejectedValue(new DOMException('Timed out', 'TimeoutError'));
    const error = await new NwsService(jest.fn().mockResolvedValue(response))
      .getForecastZone(latitude, longitude).catch(error => error);
    expect(error).toBeInstanceOf(NwsTransportError);
    expect(error).toMatchObject({ code: 'timeout', fallbackEligible: false });
  });

  it.each([[NaN, 0], [Infinity, 0], [-91, 0], [91, 0], [0, NaN], [0, -Infinity], [0, -181], [0, 181]])(
    'rejects invalid coordinates %s,%s before fetching', async (lat, lon) => {
      const fetcher = jest.fn();
      const error = await new NwsService(fetcher).getForecastZone(lat, lon).catch(error => error);
      expect(error).toBeInstanceOf(NwsInvalidCoordinatesError);
      expect(error).toMatchObject({ code: 'invalid-coordinates', fallbackEligible: false, latitude: lat, longitude: lon });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it('keeps alert validation failures structured without changing their messages', async () => {
    const error = await new NwsService(jest.fn().mockResolvedValue(json({ type: 'FeatureCollection', features: [{}] })))
      .getActiveAlerts('PRZ011').catch(error => error);
    expect(error).toBeInstanceOf(NwsInvalidResponseError);
    expect(error).toMatchObject({ code: 'invalid-response', message: 'NWS alert 0 is malformed', fallbackEligible: false });
  });

  it('structures null surf responses and invalid input zones', async () => {
    await expect(new NwsService(jest.fn().mockResolvedValue(json(null))).getConditions('PRZ011'))
      .rejects.toBeInstanceOf(NwsInvalidResponseError);
    await expect(new NwsService(jest.fn()).getActiveAlerts('AMZ745')).rejects.toBeInstanceOf(NwsInvalidZoneError);
  });
});
