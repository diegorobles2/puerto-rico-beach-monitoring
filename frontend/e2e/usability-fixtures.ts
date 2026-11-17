import type { BrowserContext, Page } from '@playwright/test';
import {
  alerts, oceanRisk, selectedAlerts, selectedWaterQuality, staleOceanRisk, staleWaterQuality,
  unavailableWaterQuality, waterQuality, weather, type ConditionOverrides,
} from './fixtures';

// Only the usability sessions/tests opt into these overrides; normal builds never import them.
export const usabilityOverrides: ConditionOverrides = {
  2: { 'water-quality': selectedWaterQuality },
  3: {
    'water-quality': { ...staleWaterQuality, lastKnownStatus: 'suitable', enterococcusValue: 12 },
    'ocean-risk': { ...staleOceanRisk, beachId: 3 },
  },
  4: {
    'water-quality': unavailableWaterQuality,
    'ocean-risk': { ...oceanRisk, beachId: 4, status: 'moderate', summary: 'Synthetic moderate rip-current risk.' },
  },
  5: {
    'water-quality': unavailableWaterQuality,
    'ocean-risk': {
      ...oceanRisk, beachId: 5, zoneId: null, status: 'unknown', availability: 'unavailable',
      observedAt: null, retrievedAt: null, sourceUrl: undefined, forecastPeriod: null,
      summary: 'No forecast-zone mapping exists for this synthetic beach.', unavailableReason: 'beach-not-mapped',
    },
    alerts: {
      ...alerts, beachId: 5, zoneId: null, status: 'unknown', availability: 'unavailable',
      retrievedAt: null, alerts: null, unavailableReason: 'beach-not-mapped',
    },
  },
};

export async function openUsabilitySession(page: Page, context: BrowserContext) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const banner = document.createElement('aside');
      banner.textContent = 'SYNTHETIC USABILITY SESSION — clock: 2026-11-13 12:00 UTC. Offline placeholder map. Not live beach conditions.';
      banner.style.cssText = 'padding:12px;background:#fff3cd;color:#533f03;font:16px sans-serif';
      document.body.prepend(banner);
      document.title = 'Synthetic O4 usability session';
    });
  });
  const sourceUrls = [waterQuality.sourceUrl!, oceanRisk.sourceUrl!, selectedAlerts.alerts![0].sourceUrl!, weather.sourceUrl!];
  for (const url of sourceUrls) {
    await context.route(url, route => route.fulfill({ contentType: 'text/html', body:
      '<!doctype html><title>Synthetic source reference</title><h1>Synthetic usability fixture</h1><p>This intercepted link demonstrates source navigation only. It is not an official report or forecast. Close this tab to return to the tasks.</p>' }));
  }
  await page.goto('/');
}
