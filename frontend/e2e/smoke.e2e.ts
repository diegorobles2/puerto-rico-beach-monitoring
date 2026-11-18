import { test, expect, beaches, waterQuality, oceanRisk } from './fixtures';

test('loads the real map and condition cards from a synthetic 35-location API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Puerto Rico Beach Monitoring', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Select beach' }).locator('option')).toHaveCount(beaches.length);
  const map = page.getByLabel('Beach map', { exact: true });
  await expect(map).toBeVisible();
  await expect(map.locator('.leaflet-interactive')).toHaveCount(35);
  await expect(page.getByRole('heading', { name: beaches[0].name, exact: true })).toBeVisible();
  const water = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Water quality', exact: true }) });
  await expect(water.getByText('Advisory', { exact: true })).toBeVisible();
  await expect(water.getByRole('link', { name: 'Read report' })).toHaveAttribute('href', waterQuality.sourceUrl!);
  const risk = page.getByRole('article', { name: 'Ocean risk', exact: true });
  await expect(risk).toContainText('Current rip-current risk: low');
  await expect(risk.getByRole('link', { name: 'Read NWS source' })).toHaveAttribute('href', oceanRisk.sourceUrl!);
  await expect(page.getByRole('article', { name: 'Alerts', exact: true })).toContainText('No active alerts reported by the latest NWS check.');
});
