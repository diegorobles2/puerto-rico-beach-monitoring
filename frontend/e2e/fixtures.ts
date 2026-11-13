import { test as base, expect } from '@playwright/test';
import type { AlertsResponse, Beach, OceanRiskResponse, WaterQualityCondition } from '../src/types';

export const NOW = new Date('2026-11-13T12:00:00Z');
// Synthetic browser coverage only: these are not verified official DRNA locations.
export const beaches: Beach[] = Array.from({ length: 35 }, (_, index) => ({
  id: index + 1,
  name: `Fixture Beach ${String(index + 1).padStart(2, '0')}`,
  municipality: index % 2 === 0 ? 'Aguada' : 'San Juan',
  latitude: 18.1 + Math.floor(index / 7) * 0.06,
  longitude: -67.1 + (index % 7) * 0.2,
}));

export const waterQuality: WaterQualityCondition = {
  status: 'advisory', source: 'DRNA', availability: 'available',
  observedAt: '2026-11-13', retrievedAt: '2026-11-13T11:00:00Z',
  sourceUrl: 'https://example.invalid/drna/report.pdf', enterococcusValue: 231,
};
export const oceanRisk: OceanRiskResponse = {
  beachId: 1, zoneId: 'PRZ001', status: 'low', availability: 'available',
  summary: 'Fixture low rip-current risk.', forecastPeriod: 'TODAY', source: 'NWS',
  observedAt: '2026-11-13T10:00:00Z', retrievedAt: '2026-11-13T11:00:00Z',
  sourceUrl: 'https://example.invalid/nws/forecast',
};
export const alerts: AlertsResponse = {
  beachId: 1, zoneId: 'PRZ001', status: 'no-active-alerts', source: 'NWS',
  retrievedAt: '2026-11-13T11:00:00Z', availability: 'available', alerts: [],
};

export const test = base.extend({
  page: async ({ page, context, baseURL }, use) => {
    const unexpected: string[] = [];
    await page.clock.setFixedTime(NOW);
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'GET' && /^https:\/\/[abc]\.tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(url.href)) {
        await route.fulfill({ contentType: 'image/png', body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
        return;
      }
      if (url.origin === baseURL && request.method() === 'GET') {
        if (url.pathname === '/api/beaches') return route.fulfill({ json: beaches });
        const match = /^\/api\/conditions\/(\d+)\/(water-quality|ocean-risk|alerts)$/.exec(url.pathname);
        if (match && beaches.some((beach) => beach.id === Number(match[1]))) {
          const beachId = Number(match[1]);
          const json = match[2] === 'water-quality' ? waterQuality
            : match[2] === 'ocean-risk' ? { ...oceanRisk, beachId } : { ...alerts, beachId };
          return route.fulfill({ json });
        }
        if (url.pathname === '/' || url.pathname.startsWith('/assets/')) return route.continue();
      }
      unexpected.push(`${request.method()} ${url.href}`);
      await route.abort('blockedbyclient');
    });
    try { await use(page); } finally {
      expect(unexpected, 'Unexpected requests were blocked; no backend or upstream pass-through is allowed').toEqual([]);
    }
  },
});

export { expect };
