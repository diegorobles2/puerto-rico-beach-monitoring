import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAlerts, getOceanRisk } from './beachApi';

describe('NWS API clients', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([[getOceanRisk, 'ocean-risk'], [getAlerts, 'alerts']] as const)('loads the normalized %s response and forwards cancellation', async (load, endpoint) => {
    const body = { availability: 'stale', status: 'unknown', alerts: [] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    expect(await load(7, signal)).toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/conditions/7/${endpoint}`), { signal });
  });
  it.each([getOceanRisk, getAlerts])('rejects failed requests', async load => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(load(7)).rejects.toThrow('Unable to load');
  });
});
