import type { Page } from '@playwright/test';
import { test, expect, beaches, waterQuality, oceanRisk, alerts as defaultAlerts,
  selectedAlerts, staleWaterQuality, staleOceanRisk, unavailableWaterQuality } from './fixtures';

const water = (page: Page) => page.getByRole('article').filter({
  has: page.getByRole('heading', { name: 'Water quality', exact: true }),
});
const risk = (page: Page) => page.getByRole('article', { name: 'Ocean risk', exact: true });
const alerts = (page: Page) => page.getByRole('article', { name: 'Alerts', exact: true });
const select = (page: Page) => page.getByRole('combobox', { name: 'Select beach' });
const refresh = (page: Page) => page.getByRole('button', { name: 'Refresh NWS data', exact: true });

async function expectFreshWater(page: Page) {
  await expect(water(page).getByText('Advisory', { exact: true })).toBeVisible();
  await expect(water(page)).toContainText('231 colonies/100 mL');
  await expect(water(page)).not.toContainText('Stale data:');
}

async function expectCurrentNws(page: Page) {
  await expect(risk(page)).toContainText('Current rip-current risk: low');
  await expect(risk(page)).not.toContainText('Last-known risk:');
  await expect(alerts(page)).toContainText('No active alerts reported by the latest NWS check.');
  await expect(alerts(page)).not.toContainText('Current alerts are unknown.');
}

// One case exercises API-declared staleness; the other exercises the client's age guard.
for (const [label, condition, retrievedText] of [
  ['API-declared stale', { ...staleWaterQuality, observedAt: '2026-11-13', retrievedAt: '2026-11-13T11:00:00Z' }, 'Nov 13, 2026, 11:00 AM'],
  ['available but older than 48 hours', { ...staleWaterQuality, availability: 'available', status: 'advisory' }, 'Nov 10, 2026, 11:00 AM'],
] as const) {
  test.describe(`water quality: ${label}`, () => {
    test.use({ conditionOverrides: { 1: { 'water-quality': condition } } });
    test('historical measurements are retained without a fresh advisory or safety claim', async ({ page }) => {
      await page.goto('/');
      await expect(water(page).getByRole('status')).toContainText('Stale data:');
      await expect(water(page).getByRole('status')).toContainText('Last-known sample status: Advisory (historical).');
      await expect(water(page).getByText('Unknown', { exact: true })).toBeVisible();
      await expect(water(page)).toContainText('Current water quality is unknown. Retained measurements are historical.');
      await expect(water(page)).toContainText('231 colonies/100 mL');
      await expect(water(page).getByRole('definition').filter({ hasText: new RegExp('^' + condition.observedAt + '$') })).toBeVisible();
      await expect(water(page)).toContainText(retrievedText);
      await expect(water(page).getByRole('link', { name: 'Read report', exact: true })).toHaveAttribute('href', waterQuality.sourceUrl!);
      await expect(water(page).getByText('Advisory', { exact: true })).toHaveCount(0);
      await expect(water(page)).not.toContainText('The latest sample indicates suitable water quality');
      await expectCurrentNws(page);
    });
  });
}

test.describe('stale ocean risk', () => {
  test.use({ conditionOverrides: { 1: { 'ocean-risk': staleOceanRisk } } });
  test('last-known low risk is historical and independent of water quality and alerts', async ({ page }) => {
    await page.goto('/');
    await expect(risk(page)).toContainText('Stale data: current ocean risk is unknown.');
    await expect(risk(page)).toContainText('Current rip-current risk: unknown');
    await expect(risk(page)).toContainText('Last-known risk: low (historical)');
    await expect(risk(page)).not.toContainText('Current rip-current risk: low');
    await expect(risk(page)).toContainText(staleOceanRisk.summary);
    await expect(risk(page)).toContainText('Low risk does not mean swimming is safe.');
    await expect(risk(page).locator('time')).toHaveCount(2);
    await expect(risk(page).locator('time').nth(0)).toHaveAttribute('datetime', staleOceanRisk.observedAt!);
    await expect(risk(page).locator('time').nth(1)).toHaveAttribute('datetime', staleOceanRisk.retrievedAt!);
    await expect(risk(page).getByRole('link', { name: 'Read NWS source', exact: true })).toHaveAttribute('href', staleOceanRisk.sourceUrl!);
    await expectFreshWater(page);
    await expect(alerts(page)).toContainText('No active alerts reported by the latest NWS check.');
  });
});

test.describe('unavailable water quality', () => {
  test.use({ conditionOverrides: { 1: { 'water-quality': unavailableWaterQuality } } });
  test('absence of measurements does not alter current NWS categories', async ({ page }) => {
    await page.goto('/');
    await expect(water(page)).toContainText('Water quality unavailable');
    await expect(water(page)).toContainText('No recent water-quality data available.');
    await expect(water(page).getByText(/^(Suitable|Advisory)$/)).toHaveCount(0);
    await expect(water(page)).not.toContainText('colonies/100 mL');
    await expect(water(page).getByRole('link')).toHaveCount(0);
    await expectCurrentNws(page);
    await expect(select(page)).toBeEnabled();
  });
});

for (const category of ['water-quality', 'ocean-risk'] as const) {
  test(`initial ${category} HTTP failure has no last-known data and leaves other categories usable`, async ({ page, failedConditionRequests }) => {
    failedConditionRequests.add(`1/${category}`);
    await page.goto('/');
    if (category === 'water-quality') {
      await expect(water(page)).toContainText('Water quality unavailable');
      await expect(water(page)).toContainText('Unable to load water-quality conditions');
      await expect(water(page)).not.toContainText('231 colonies/100 mL');
      await expectCurrentNws(page);
    } else {
      await expect(risk(page)).toContainText('Unable to load ocean risk. Current risk could not be verified.');
      await expect(risk(page)).toContainText('Current rip-current risk: unknown');
      await expect(risk(page)).not.toContainText('Last-known risk:');
      await expect(risk(page)).not.toContainText('Current rip-current risk: low');
      await expectFreshWater(page);
      await expect(alerts(page)).toContainText('No active alerts reported by the latest NWS check.');
    }
    await expect(select(page)).toBeEnabled();
  });
}

test.describe('unavailable alerts', () => {
  test.use({ conditionOverrides: { 1: { alerts: {
    ...defaultAlerts, availability: 'unavailable', status: 'unknown', alerts: null,
    retrievedAt: null, unavailableReason: 'no-data',
  } } } });
  test('unknown alerts are not presented as confirmed clear', async ({ page }) => {
    await page.goto('/');
    await expect(alerts(page)).toContainText('Alert source unavailable. Current alerts are unknown.');
    await expect(alerts(page)).not.toContainText('No active alerts reported');
    await expect(alerts(page)).toContainText('Retrieved: Not available');
    await expectFreshWater(page);
    await expect(risk(page)).toContainText('Current rip-current risk: low');
  });
});

test.describe('stale empty alert response', () => {
  test.use({ conditionOverrides: { 1: { alerts: { ...defaultAlerts, availability: 'stale' } } } });
  test('an old empty list does not confirm absence of current alerts', async ({ page }) => {
    await page.goto('/');
    await expect(alerts(page)).toContainText('Stale data: new alerts may be missing.');
    await expect(alerts(page)).toContainText('Current alerts are unknown.');
    await expect(alerts(page)).not.toContainText('No active alerts reported');
    await expectFreshWater(page);
    await expect(risk(page)).toContainText('Current rip-current risk: low');
  });
});

test('failed ocean refresh retains the last good forecast as historical, then recovers', async ({ page, failedConditionRequests }) => {
  await page.goto('/');
  await expectCurrentNws(page);
  await expectFreshWater(page);
  failedConditionRequests.add('1/ocean-risk');
  await refresh(page).click();
  await expect(risk(page)).toContainText('Unable to load ocean risk. Current risk could not be verified.');
  await expect(risk(page)).toHaveAttribute('aria-busy', 'false');
  await expect(risk(page)).toContainText('Current rip-current risk: unknown');
  await expect(risk(page)).toContainText('Last-known risk: low (historical)');
  await expect(risk(page)).toContainText(oceanRisk.summary);
  await expect(risk(page)).not.toContainText('Current rip-current risk: low');
  await expect(risk(page).getByRole('link', { name: 'Read NWS source', exact: true })).toHaveAttribute('href', oceanRisk.sourceUrl!);
  await expect(risk(page).locator('time').nth(1)).toHaveAttribute('datetime', oceanRisk.retrievedAt!);
  await expect(alerts(page)).toHaveAttribute('aria-busy', 'false');
  await expect(alerts(page)).toContainText('No active alerts reported by the latest NWS check.');
  await expectFreshWater(page);
  failedConditionRequests.delete('1/ocean-risk');
  await refresh(page).click();
  await expectCurrentNws(page);
  await expect(risk(page)).not.toContainText('Unable to load ocean risk');
});

for (const beachId of [1, 2]) {
  test(`failed alerts refresh at beach ${beachId} retains its own history without claiming current clearance`, async ({ page, failedConditionRequests }) => {
    await page.goto('/');
    await select(page).selectOption(String(beachId));
    if (beachId === 2) {
      await expect(alerts(page).getByText('Active alerts', { exact: true })).toBeVisible();
      await expect(water(page).getByText('Suitable', { exact: true })).toBeVisible();
      await expect(risk(page)).toContainText('Current rip-current risk: high');
    } else {
      await expectCurrentNws(page);
    }
    failedConditionRequests.add(`${beachId}/alerts`);
    await refresh(page).click();
    await expect(alerts(page)).toContainText('Unable to load alerts. Current alerts could not be verified.');
    await expect(alerts(page)).toHaveAttribute('aria-busy', 'false');
    await expect(alerts(page)).not.toContainText('No active alerts reported');
    if (beachId === 2) {
      await expect(alerts(page)).toContainText('Last-known alerts (not verified as current)');
      await expect(alerts(page).getByText('Active alerts', { exact: true })).toHaveCount(0);
      await expect(alerts(page)).toContainText(selectedAlerts.alerts![0].title);
      await expect(alerts(page)).toContainText(selectedAlerts.alerts![0].description);
      await expect(alerts(page).getByRole('link', { name: 'Read NWS source', exact: true })).toHaveAttribute('href', selectedAlerts.alerts![0].sourceUrl!);
      await expect(water(page).getByText('Suitable', { exact: true })).toBeVisible();
    } else {
      await expect(alerts(page)).toContainText('Current alerts are unknown.');
      await expectFreshWater(page);
    }
    await expect(alerts(page).locator('time').last()).toHaveAttribute('datetime', defaultAlerts.retrievedAt!);
    await expect(risk(page)).toHaveAttribute('aria-busy', 'false');
    await expect(risk(page)).toContainText(`Current rip-current risk: ${beachId === 2 ? 'high' : 'low'}`);
    await expect(risk(page)).not.toContainText('Last-known risk:');
  });
}

test.describe('switching beaches with stale responses', () => {
  test.use({ conditionOverrides: { 1: { 'water-quality': staleWaterQuality, 'ocean-risk': staleOceanRisk } } });
  test('warnings and historical values follow the selected beach in both directions', async ({ page }) => {
    await page.goto('/');
    for (const beachId of [1, 2, 1]) {
      await select(page).selectOption(String(beachId));
      await expect(page.getByRole('heading', { name: beaches[beachId - 1].name, exact: true })).toBeVisible();
      if (beachId === 1) {
        await expect(water(page).getByRole('status')).toContainText('Last-known sample status: Advisory (historical).');
        await expect(water(page).getByText('Unknown', { exact: true })).toBeVisible();
        await expect(water(page)).toContainText('231 colonies/100 mL');
        await expect(risk(page)).toContainText('Stale data: current ocean risk is unknown.');
        await expect(risk(page)).toContainText('Current rip-current risk: unknown');
        await expect(risk(page)).toContainText('Last-known risk: low (historical)');
        await expect(risk(page)).toContainText(staleOceanRisk.summary);
        await expect(alerts(page)).toContainText('No active alerts reported by the latest NWS check.');
        await expect(alerts(page)).not.toContainText(selectedAlerts.alerts![0].title);
      } else {
        await expect(water(page).getByText('Suitable', { exact: true })).toBeVisible();
        await expect(water(page)).toContainText('12 colonies/100 mL');
        await expect(water(page)).not.toContainText('231 colonies/100 mL');
        await expect(water(page)).not.toContainText('Stale data:');
        await expect(risk(page)).toContainText('Current rip-current risk: high');
        await expect(risk(page)).not.toContainText('Last-known risk:');
        await expect(risk(page)).not.toContainText('Stale data:');
        await expect(risk(page)).not.toContainText(staleOceanRisk.summary);
        await expect(alerts(page).getByText('Active alerts', { exact: true })).toBeVisible();
        await expect(alerts(page)).toContainText(selectedAlerts.alerts![0].title);
      }
    }
  });
});
