import { test, expect, beaches, waterQuality, oceanRisk, selectedBeach,
  selectedWaterQuality, selectedOceanRisk, selectedAlerts } from './fixtures';
import type { Page } from '@playwright/test';

const selection = (page: Page) => page.getByRole('combobox', { name: 'Select beach' });
const markers = (page: Page) => page.getByLabel('Beach map', { exact: true }).locator('.leaflet-interactive');
const water = (page: Page) => page.getByRole('article').filter({
  has: page.getByRole('heading', { name: 'Water quality', exact: true }),
});
const risk = (page: Page) => page.getByRole('article', { name: 'Ocean risk', exact: true });
const alerts = (page: Page) => page.getByRole('article', { name: 'Alerts', exact: true });
const optionLabels = (items: typeof beaches) => items.map(beach => `${beach.name} (${beach.municipality})`);

// The original smoke test retains default condition-card coverage.
test('O1 map loading represents all 35 beaches and supports map selection', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Puerto Rico Beach Monitoring', exact: true })).toBeVisible();
  const map = page.getByLabel('Beach map', { exact: true });
  await expect(map.locator('.leaflet-container')).toBeVisible();
  await expect(markers(page)).toHaveCount(35);
  await expect(selection(page).locator('option')).toHaveText(optionLabels(beaches));
  await expect(page.getByRole('region', { name: 'Find a beach' })).toBeVisible();
  await markers(page).nth(1).click();
  await expect(selection(page)).toHaveValue('2');
  await expect(page.getByRole('heading', { name: selectedBeach.name, exact: true })).toBeVisible();
  await expect(map.locator('.leaflet-popup-content')).toHaveText(`${selectedBeach.name}, ${selectedBeach.municipality}`);
});

test('O1 search and municipality filters combine and clear', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Search beaches' });
  const municipality = page.getByRole('combobox', { name: 'Municipality', exact: true });
  await search.fill('Fixture Beach 02');
  await expect(selection(page).locator('option')).toHaveText(optionLabels([selectedBeach]));
  await expect(markers(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await municipality.selectOption('San Juan');
  const subset = beaches.filter(beach => beach.municipality === 'San Juan');
  await expect(selection(page).locator('option')).toHaveText(optionLabels(subset));
  await expect(markers(page)).toHaveCount(subset.length);
  await search.fill('Fixture Beach 02');
  await expect(selection(page).locator('option')).toHaveText(optionLabels([selectedBeach]));
  await municipality.selectOption('Aguada');
  await expect(page.getByRole('status').filter({ hasText: 'No beaches match your search.' })).toBeVisible();
  await expect(selection(page)).toHaveCount(0);
  await expect(markers(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(municipality).toHaveValue('');
  await expect(selection(page).locator('option')).toHaveText(optionLabels(beaches));
  await expect(markers(page)).toHaveCount(35);
});

test('O1 granted geolocation sorts by deterministic distance and can be cleared', async ({ page, context }) => {
  const nearest = beaches[34];
  await context.setGeolocation({ latitude: nearest.latitude, longitude: nearest.longitude });
  await context.grantPermissions(['geolocation']);
  await page.goto('/');
  await expect(selection(page).locator('option').first()).toHaveAttribute('value', '1');
  await page.getByRole('button', { name: 'Sort by nearest to me', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Beaches are sorted by distance from you.' })).toBeVisible();
  await expect(selection(page).locator('option').first()).toHaveAttribute('value', String(nearest.id));
  await expect(selection(page).locator('option').first()).toContainText('0 m');
  await expect(markers(page)).toHaveCount(36); // 35 beaches plus the user's location.
  await selection(page).selectOption(String(nearest.id));
  await expect(page.getByText('Distance from you:', { exact: true })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: /^0 m$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Stop using my location', exact: true }).click();
  await expect(markers(page)).toHaveCount(35);
  await expect(selection(page).locator('option')).toHaveText(optionLabels(beaches));
  await expect(page.getByText('Distance from you:', { exact: true })).toHaveCount(0);
});

test('O1 denied geolocation leaves search and selection usable', async ({ page, context }) => {
  // An explicit empty permission allowlist denies geolocation in Chromium.
  await context.grantPermissions([]);
  await page.goto('/');
  expect(await page.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state)).toBe('denied');
  await page.getByRole('button', { name: 'Sort by nearest to me', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Location permission was denied.' })).toBeVisible();
  await expect(markers(page)).toHaveCount(35);
  await expect(selection(page).locator('option')).toHaveText(optionLabels(beaches));
  await page.getByRole('searchbox', { name: 'Search beaches' }).fill(selectedBeach.name);
  await expect(selection(page)).toHaveValue('2');
  await expect(page.getByRole('heading', { name: selectedBeach.name, exact: true })).toBeVisible();
  await expect(water(page).getByText('Suitable', { exact: true })).toBeVisible();
});

test('O1 selected beach details and all conditions belong to the selected beach', async ({ page }) => {
  await page.goto('/');
  await expect(water(page).getByText('Advisory', { exact: true })).toBeVisible();
  await selection(page).selectOption(String(selectedBeach.id));
  await expect(page.getByRole('heading', { name: selectedBeach.name, exact: true })).toBeVisible();
  const details = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Beach details', exact: true }) });
  await expect(details.getByRole('definition')).toHaveText([
    selectedBeach.municipality, `${selectedBeach.latitude}, ${selectedBeach.longitude}`,
  ]);
  await expect(water(page).getByText('Suitable', { exact: true })).toBeVisible();
  await expect(water(page)).toContainText(`${selectedWaterQuality.enterococcusValue} colonies/100 mL`);
  await expect(water(page).getByText('Advisory', { exact: true })).toHaveCount(0);
  await expect(risk(page)).toContainText('Current rip-current risk: high');
  await expect(risk(page)).toContainText(selectedOceanRisk.summary);
  await expect(alerts(page).getByRole('heading', { name: selectedAlerts.alerts![0].title, exact: true })).toBeVisible();
  await expect(alerts(page)).toContainText(selectedAlerts.alerts![0].description);
  await expect(alerts(page)).not.toContainText('No active alerts reported');
});

test('O1 DRNA and NWS source links stay associated with their categories', async ({ page }) => {
  await page.goto('/');
  await selection(page).selectOption(String(selectedBeach.id));
  const links = [
    { card: water(page), name: 'Read report', href: waterQuality.sourceUrl! },
    { card: risk(page), name: 'Read NWS source', href: oceanRisk.sourceUrl! },
    { card: alerts(page), name: 'Read NWS source', href: selectedAlerts.alerts![0].sourceUrl! },
  ];
  for (const { card, name, href } of links) {
    const link = card.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noreferrer');
  }
  await expect(water(page)).toContainText('DRNA');
  await expect(risk(page)).toContainText('Source: NWS');
  await expect(alerts(page)).toContainText('Source: NWS');
});

test.describe('O1 unavailable-category fallback', () => {
  test.use({ unavailableOceanRisk: true });
  test('unknown ocean risk preserves available water quality and alerts', async ({ page }) => {
    await page.goto('/');
    await selection(page).selectOption(String(selectedBeach.id));
    await expect(risk(page)).toContainText('Ocean risk unavailable. No usable published risk is available for this beach.');
    await expect(risk(page)).toContainText('Current rip-current risk: unknown');
    await expect(risk(page)).not.toContainText('Current rip-current risk: low');
    await expect(risk(page)).not.toContainText('Current rip-current risk: high');
    await expect(risk(page).getByRole('link')).toHaveCount(0);
    await expect(water(page).getByText('Suitable', { exact: true })).toBeVisible();
    await expect(water(page)).toContainText('12 colonies/100 mL');
    await expect(alerts(page).getByRole('heading', { name: selectedAlerts.alerts![0].title, exact: true })).toBeVisible();
    await expect(alerts(page)).not.toContainText('No active alerts reported');
    await expect(markers(page)).toHaveCount(35);
    await expect(selection(page)).toBeEnabled();
  });
});
