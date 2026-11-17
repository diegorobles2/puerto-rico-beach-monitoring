import { test, expect, weather } from './fixtures';

test('weather uses its own card and follows the selected beach', async ({ page }) => {
  await page.goto('/');
  const card = page.getByRole('article', { name: 'Weather', exact: true });
  await expect(card).toContainText('80°F');
  await expect(card).toContainText('not live observations');
  await expect(card.getByRole('link', { name: 'Read NWS source' })).toHaveAttribute('href', weather.sourceUrl!);
  await page.getByRole('combobox', { name: 'Select beach' }).selectOption('2');
  await expect(card).toContainText('88°F');
  await expect(card).not.toContainText('80°F');
  await expect(page.getByRole('article', { name: 'Ocean risk', exact: true })).toContainText('Current rip-current risk: high');
});

test('weather refresh failure retains historical values and can recover independently', async ({ page, failedConditionRequests }) => {
  await page.goto('/');
  const card = page.getByRole('article', { name: 'Weather', exact: true });
  await expect(card).toContainText('80°F');
  failedConditionRequests.add('1/weather');
  await page.getByRole('button', { name: 'Refresh NWS data' }).click();
  await expect(card).toContainText('Unable to load weather forecast');
  await expect(card).toContainText('Last-known forecast (historical)');
  await expect(card).toContainText('80°F');
  await expect(page.getByRole('article', { name: 'Ocean risk', exact: true })).toContainText('Current rip-current risk: low');
  failedConditionRequests.delete('1/weather');
  await page.getByRole('button', { name: 'Refresh NWS data' }).click();
  await expect(card).not.toContainText('Stale data:');
  await expect(card).not.toContainText('Unable to load weather forecast');
});

test.describe('unsupported weather mapping', () => {
  test.use({ conditionOverrides: { 1: { weather: { ...weather, forecast: null, availability: 'unavailable',
    observedAt: null, retrievedAt: null, sourceUrl: undefined, unavailableReason: 'unsupported-location' } } } });
  test('coverage is explicit without changing ocean risk or water quality', async ({ page }) => {
    await page.goto('/');
    const card = page.getByRole('article', { name: 'Weather', exact: true });
    await expect(card).toContainText('no supported forecast mapping');
    await expect(card).not.toContainText('80°F');
    await expect(page.getByRole('article', { name: 'Ocean risk', exact: true })).toContainText('Current rip-current risk: low');
    await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Water quality', exact: true }) })).toContainText('231 colonies/100 mL');
  });
});

test.describe('stale weather', () => {
  test.use({ conditionOverrides: { 1: { weather: { ...weather, availability: 'stale', observedAt: '2026-11-10T00:00:00Z' } } } });
  test('retained temperatures are historical', async ({ page }) => {
    await page.goto('/');
    const card = page.getByRole('article', { name: 'Weather', exact: true });
    await expect(card).toContainText('Last-known forecast (historical)');
    await expect(card).toContainText('80°F');
    await page.getByRole('combobox', { name: 'Select beach' }).selectOption('2');
    await expect(card).toContainText('88°F');
    await expect(card).not.toContainText('Stale data:');
  });
});

test('malformed weather API responses cannot show an invented forecast', async ({ page, context }) => {
  await context.route('**/api/conditions/1/weather', route => route.fulfill({ json: { beachId: 1, availability: 'available' } }));
  await page.goto('/');
  const card = page.getByRole('article', { name: 'Weather', exact: true });
  await expect(card).toContainText('Unable to load weather forecast');
  await expect(card).not.toContainText('80°F');
  await expect(card).not.toContainText('Last-known forecast');
});
