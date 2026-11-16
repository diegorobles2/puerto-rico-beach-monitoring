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
  sourceUrl: 'https://www.drna.pr.gov/wp-content/uploads/2026/09/Monitoria-de-playas-25-de-Septiembre-de-2026.pdf', enterococcusValue: 231,
};
export const oceanRisk: OceanRiskResponse = {
  beachId: 1, zoneId: 'PRZ001', status: 'low', availability: 'available',
  summary: 'Fixture low rip-current risk.', forecastPeriod: 'TODAY', source: 'NWS',
  observedAt: '2026-11-13T10:00:00Z', retrievedAt: '2026-11-13T11:00:00Z',
  sourceUrl: 'https://api.weather.gov/products/02f99345-ccbf-4d88-94da-7e6aee5521da',
};
export const alerts: AlertsResponse = {
  beachId: 1, zoneId: 'PRZ001', status: 'no-active-alerts', source: 'NWS',
  retrievedAt: '2026-11-13T11:00:00Z', availability: 'available', alerts: [],
};

// Beach 2 deliberately differs from the default so selection tests detect stale cards.
export const selectedBeach = beaches[1];
export const selectedWaterQuality: WaterQualityCondition = {
  ...waterQuality, status: 'suitable', enterococcusValue: 12,
};
export const selectedOceanRisk: OceanRiskResponse = {
  ...oceanRisk, beachId: 2, status: 'high', summary: 'Fixture Beach 02 high rip-current risk.',
};
export const selectedAlerts: AlertsResponse = {
  ...alerts, beachId: 2, status: 'active-alerts', alerts: [{
    id: 'fixture-beach-02-alert', title: 'Fixture Beach 02 coastal warning',
    description: 'Synthetic hazardous surf at Fixture Beach 02.', instruction: 'Stay out of the surf.',
    severity: 'Severe', certainty: 'Likely', urgency: 'Expected',
    effectiveAt: '2026-11-13T10:00:00Z', expiresAt: '2026-11-14T10:00:00Z',
    observedAt: '2026-11-13T10:00:00Z', retrievedAt: '2026-11-13T11:00:00Z',
    sourceUrl: 'https://api.weather.gov/alerts/fixture-beach-02',
  }],
};

export const staleWaterQuality: WaterQualityCondition = {
  ...waterQuality, status: 'unknown', lastKnownStatus: 'advisory', availability: 'stale',
  observedAt: '2026-11-10', retrievedAt: '2026-11-10T11:00:00Z',
};
export const staleOceanRisk: OceanRiskResponse = {
  ...oceanRisk, status: 'unknown', lastKnownStatus: 'low', availability: 'stale',
  summary: 'Retained fixture low-risk forecast from November 10.',
  observedAt: '2026-11-10T10:00:00Z', retrievedAt: '2026-11-10T11:00:00Z',
};
export const unavailableWaterQuality: WaterQualityCondition = {
  status: 'unknown', source: 'DRNA', availability: 'unavailable',
  observedAt: null, retrievedAt: null,
};

type ConditionCategory = 'water-quality' | 'ocean-risk' | 'alerts';
type ConditionOverrides = Record<number, Partial<{
  'water-quality': WaterQualityCondition;
  'ocean-risk': OceanRiskResponse;
  alerts: AlertsResponse;
}>>;
type ConditionFixtures = {
  unavailableOceanRisk: boolean;
  conditionOverrides: ConditionOverrides;
  failedConditionRequests: Set<`${number}/${ConditionCategory}`>;
};

// Overrides replace whole typed payloads; failures are enabled explicitly by each test.
export const test = base.extend<ConditionFixtures>({
  unavailableOceanRisk: [false, { option: true }],
  conditionOverrides: [{}, { option: true }],
  failedConditionRequests: async ({}, use) => { await use(new Set()); },
  page: async ({ page, context, baseURL, unavailableOceanRisk, conditionOverrides, failedConditionRequests }, use) => {
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
          const category = match[2] as ConditionCategory;
          if (failedConditionRequests.has(`${beachId}/${category}`)) {
            return route.fulfill({ status: 503, json: { message: 'Synthetic condition failure' } });
          }
          const risk: OceanRiskResponse = unavailableOceanRisk
            ? { ...oceanRisk, beachId, status: 'unknown', availability: 'unavailable',
                summary: 'No published risk for this fixture.', forecastPeriod: null,
                observedAt: null, sourceUrl: undefined, unavailableReason: 'no-data' }
            : { ...(beachId === 2 ? selectedOceanRisk : oceanRisk), beachId };
          const json = match[2] === 'water-quality' ? (beachId === 2 ? selectedWaterQuality : waterQuality)
            : match[2] === 'ocean-risk' ? risk : { ...(beachId === 2 ? selectedAlerts : alerts), beachId };
          return route.fulfill({ json: conditionOverrides[beachId]?.[category] ?? json });
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
