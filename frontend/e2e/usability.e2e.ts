import { test, expect, waterQuality, oceanRisk } from './fixtures';
import { usabilityOverrides, openUsabilitySession } from './usability-fixtures';

test.use({ conditionOverrides: usabilityOverrides });

test('manual fixture mode labels synthetic data and intercepts source navigation offline', async ({ page, context }) => {
  await openUsabilitySession(page, context);
  await expect(page).toHaveTitle('Synthetic O4 usability session');
  await expect(page.getByText(/SYNTHETIC USABILITY SESSION — clock/)).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Read report', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'Synthetic usability fixture' })).toBeVisible();
  await expect(popup).toHaveURL(waterQuality.sourceUrl!);
  await popup.close();
  await Promise.all([page.waitForEvent('close'), page.close()]);
});

test('O4 fixture T1: find the requested beach with combined filters', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search beaches' }).fill('Fixture Beach 02');
  await page.getByRole('combobox', { name: /municipality/i }).selectOption('San Juan');
  await expect(page.getByRole('combobox', { name: 'Select beach' }).getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Fixture Beach 02', exact: true })).toBeVisible();
  await expect(page.locator('.leaflet-interactive')).toHaveCount(1);
});

test('O4 fixture T2: a current advisory has its supporting measurement', async ({ page }) => {
  await page.goto('/');
  const water = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Water quality', exact: true }) });
  await expect(water.getByText('Advisory', { exact: true })).toBeVisible();
  await expect(water).toContainText('231 colonies/100 mL');
  await expect(water).not.toContainText('Stale data:');
});

test('O4 fixture T3: high ocean risk includes the active alert', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Select beach' }).selectOption('2');
  await expect(page.getByRole('article', { name: 'Ocean risk', exact: true })).toContainText('Current rip-current risk: high');
  await expect(page.getByRole('article', { name: 'Alerts', exact: true })).toContainText('Fixture Beach 02 coastal warning');
});

test('O4 fixture T4: suitable water and high ocean risk remain separate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Select beach' }).selectOption('2');
  const water = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Water quality', exact: true }) });
  await expect(water.getByText('Suitable', { exact: true })).toBeVisible();
  await expect(water).toContainText('not a safety guarantee');
  await expect(page.getByRole('article', { name: 'Ocean risk', exact: true })).toContainText('Current rip-current risk: high');
});

test('O4 fixture T5: both categories expose independent sources and timestamps', async ({ page }) => {
  await page.goto('/');
  const water = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Water quality', exact: true }) });
  const risk = page.getByRole('article', { name: 'Ocean risk', exact: true });
  await expect(water).toContainText('DRNA');
  await expect(water).toContainText('2026-11-13');
  await expect(water).toContainText('Observed');
  await expect(water).toContainText('Retrieved');
  await expect(water.getByRole('link', { name: 'Read report' })).toHaveAttribute('href', waterQuality.sourceUrl!);
  await expect(risk).toContainText('NWS');
  await expect(risk.locator('time')).toHaveCount(2);
  await expect(risk.getByRole('link', { name: 'Read NWS source' })).toHaveAttribute('href', oceanRisk.sourceUrl!);
});

test('O4 fixture T6: historical, missing, and unmapped categories never imply clearance', async ({ page }) => {
  await page.goto('/');
  const select = page.getByRole('combobox', { name: 'Select beach' });
  const water = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Water quality', exact: true }) });
  const risk = page.getByRole('article', { name: 'Ocean risk', exact: true });
  await select.selectOption('3');
  await expect(water).toContainText('Last-known sample status: Suitable (historical)');
  await expect(water.getByText('Unknown', { exact: true })).toBeVisible();
  await expect(risk).toContainText('Current rip-current risk: unknown');
  await select.selectOption('4');
  await expect(water).toContainText('Water quality unavailable');
  await expect(water).not.toContainText('colonies/100 mL');
  await expect(risk).toContainText('Current rip-current risk: moderate');
  await select.selectOption('5');
  await expect(risk).toContainText('No forecast-zone mapping exists');
  await expect(risk).toContainText('Current rip-current risk: unknown');
  await expect(page.getByRole('article', { name: 'Alerts', exact: true })).toContainText('Current alerts are unknown');
});
