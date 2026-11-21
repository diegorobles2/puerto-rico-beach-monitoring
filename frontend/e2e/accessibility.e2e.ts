import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { test, expect, beaches, selectedBeach, staleOceanRisk, staleWaterQuality, waterQuality } from './fixtures';

// Automated checks only. They do not replace the manual review recorded in
// docs/testing/accessibility.md and are not a WCAG conformance claim.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  // Let Leaflet's popup fades settle so contrast is measured at full opacity. Re-check the live
  // DOM each time: a popup whose marker was filtered out fades away and is removed.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.leaflet-popup')].every((popup) => getComputedStyle(popup).opacity === '1'));
  const all = await new AxeBuilder({ page }).withTags(WCAG_TAGS).disableRules(['target-size']).analyze();
  // WCAG 2.5.8 "Equivalent" exception: nearby beach markers can overlap at island zoom, and the
  // same selection is offered by the 44px "Select beach" control. All other targets are checked.
  const targets = await new AxeBuilder({ page }).withRules(['target-size']).exclude('.beach-marker').analyze();
  const summary = [...all.violations, ...targets.violations]
    .map((v) => `${v.impact} ${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary, 'axe WCAG A/AA violations').toEqual([]);
}

const selection = (page: Page) => page.getByRole('combobox', { name: 'Select beach' });
const marker = (page: Page, beach: (typeof beaches)[number], selected = false) =>
  page.getByRole('button', { name: `${beach.name}, ${beach.municipality}${selected ? ' (selected)' : ''}`, exact: true });
const risk = (page: Page) => page.getByRole('article', { name: 'Ocean risk', exact: true });

async function loadedPage(page: Page) {
  await page.goto('/');
  await expect(risk(page)).toContainText('Current rip-current risk:');
  await expect(risk(page)).toHaveAttribute('aria-busy', 'false');
}

async function tabUntil(page: Page, target: Locator, maxTabs = 80) {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error('Target was not reached with the Tab key');
}

test.describe('axe scans', () => {
  test('default beach page', async ({ page }) => {
    await loadedPage(page);
    await expectNoAxeViolations(page);
  });

  test('loading state', async ({ page }) => {
    // Hold every condition request so all cards stay in their loading state.
    await page.route('**/api/conditions/**', () => {});
    await page.goto('/');
    await expect(risk(page)).toContainText('Loading ocean risk...');
    await expect(page.getByText('Loading water-quality status…')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('error state', async ({ page, failedConditionRequests }) => {
    for (const category of ['water-quality', 'ocean-risk', 'alerts', 'weather'] as const) failedConditionRequests.add(`1/${category}`);
    await loadedPage(page);
    await expect(page.getByText('Unable to load water-quality conditions')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test.describe('stale state', () => {
    test.use({ conditionOverrides: { 1: { 'water-quality': staleWaterQuality, 'ocean-risk': staleOceanRisk } } });
    test('stale water quality and ocean risk', async ({ page }) => {
      await loadedPage(page);
      await expect(risk(page)).toContainText('Stale data: current ocean risk is unknown.');
      await expectNoAxeViolations(page);
    });
  });

  test('active alerts, empty search results, and an open map popup', async ({ page }) => {
    await loadedPage(page);
    await selection(page).selectOption(String(selectedBeach.id));
    await expect(page.getByRole('heading', { name: 'Fixture Beach 02 coastal warning' })).toBeVisible();
    await marker(page, selectedBeach, true).click();
    await expect(page.locator('.leaflet-popup-content')).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('searchbox', { name: 'Search beaches' }).fill('no such beach');
    await expect(page.getByText(/No beaches match your search/)).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('denied geolocation message', async ({ page, context }) => {
    await context.grantPermissions([]);
    await loadedPage(page);
    await page.getByRole('button', { name: 'Sort by nearest to me' }).click();
    await expect(page.getByText(/Location permission was denied/)).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('small-screen layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await loadedPage(page);
    await expectNoAxeViolations(page);
  });
});

test.describe('keyboard access', () => {
  test('selects a beach from the list with arrow keys and loads its conditions', async ({ page }) => {
    await loadedPage(page);
    await tabUntil(page, selection(page));
    await page.keyboard.press('ArrowDown');
    await expect(selection(page)).toHaveValue(String(selectedBeach.id));
    await expect(page.getByRole('heading', { level: 2, name: selectedBeach.name, exact: true })).toBeVisible();
    await expect(risk(page)).toContainText('Current rip-current risk: high');
  });

  test('map markers are focusable buttons selected with Enter or Space, like a click', async ({ page }) => {
    await loadedPage(page);
    await tabUntil(page, marker(page, beaches[0], true));
    await expect(marker(page, beaches[0], true)).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(marker(page, selectedBeach)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(selection(page)).toHaveValue(String(selectedBeach.id));
    await expect(marker(page, selectedBeach, true)).toBeFocused();
    await expect(page.locator('.leaflet-popup-content')).toHaveText(`${selectedBeach.name}, ${selectedBeach.municipality}`);
    await expect(risk(page)).toContainText('Current rip-current risk: high');

    await page.keyboard.press('Shift+Tab');
    await expect(marker(page, beaches[0])).toBeFocused();
    await page.keyboard.press(' ');
    await expect(selection(page)).toHaveValue(String(beaches[0].id));
    await expect(risk(page)).toContainText('Current rip-current risk: low');
  });

  test('skip link moves focus past the map markers to the conditions', async ({ page }) => {
    await loadedPage(page);
    const skip = page.getByRole('link', { name: 'Skip map to beach conditions' });
    await tabUntil(page, skip);
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Beach conditions' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Read report' })).toBeFocused();
  });

  test('source links can be followed from the keyboard', async ({ page, context }) => {
    // Later routes take precedence: answer the official source locally instead of blocking it.
    await context.route(waterQuality.sourceUrl!, (route) => route.fulfill({ contentType: 'text/html', body: '<title>DRNA report</title>' }));
    await loadedPage(page);
    const link = page.getByRole('link', { name: 'Read report' });
    await tabUntil(page, link);
    const [popup] = await Promise.all([context.waitForEvent('page'), page.keyboard.press('Enter')]);
    await expect(popup).toHaveURL(waterQuality.sourceUrl!);
    await popup.close();

    const nwsLinks = page.getByRole('link', { name: 'Read NWS source' });
    await expect(nwsLinks.first()).toHaveAttribute('href', /^https:\/\/api\.weather\.gov\//);
    await tabUntil(page, nwsLinks.first());
    await expect(nwsLinks.first()).toBeFocused();
  });

  test('refresh can be triggered from the keyboard', async ({ page }) => {
    await loadedPage(page);
    const refresh = page.getByRole('button', { name: 'Refresh NWS data' });
    await tabUntil(page, refresh);
    const request = page.waitForRequest((r) => r.url().endsWith('/api/conditions/1/ocean-risk'));
    await page.keyboard.press('Enter');
    await request;
    await expect(risk(page)).toHaveAttribute('aria-busy', 'false');
    await expect(refresh).toBeFocused();
  });

  test('every tab stop shows a visible focus indicator', async ({ page }) => {
    await loadedPage(page);
    const seen: string[] = [];
    for (let i = 0; i < 70; i++) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          name: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}"`,
          outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
        };
      });
      if (!focus) break;
      seen.push(focus.name);
      expect(focus.outline, `focus indicator on ${focus.name}`).toBe(true);
    }
    // Sanity check that the walk covered the controls, the markers, and the refresh button.
    expect(seen.length).toBeGreaterThan(beaches.length);
    expect(seen.some((name) => name.includes('Refresh NWS data'))).toBe(true);
  });
});

test.describe('small-screen layout', () => {
  for (const width of [320, 375]) {
    test.describe(`${width}px viewport`, () => {
      test.use({ viewport: { width, height: 740 } });

      test('no horizontal overflow, with long alert content shown', async ({ page }) => {
        await loadedPage(page);
        await selection(page).selectOption(String(selectedBeach.id));
        await expect(page.getByRole('heading', { name: 'Fixture Beach 02 coastal warning' })).toBeVisible();
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      });

      test('controls meet the 24px target minimum and are not obstructed', async ({ page }) => {
        await loadedPage(page);
        const controls = page.locator('main').locator('a[href], button, input, select, [role="button"]');
        const count = await controls.count();
        expect(count).toBeGreaterThan(beaches.length);
        const problems: string[] = [];
        for (let i = 0; i < count; i++) {
          const control = controls.nth(i);
          // Leaflet's attribution links are inline text, which WCAG 2.5.8 exempts. Beach markers can
          // overlap or be panned out of view; their keyboard access is covered above, and the
          // "Select beach" control is the equivalent target (see expectNoAxeViolations).
          if (await control.evaluate((el) => !!el.closest('.leaflet-control-attribution') || el.classList.contains('sr-only')
            || el.classList.contains('beach-marker'))) continue;
          if (!(await control.isVisible())) continue;
          await control.scrollIntoViewIfNeeded();
          const result = await control.evaluate((el) => {
            const box = el.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return {
              name: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40),
              width: box.width,
              height: box.height,
              reachable: !!hit && (el === hit || el.contains(hit)),
            };
          });
          if (result.width < 24 || result.height < 24) problems.push(`${result.name} is ${Math.round(result.width)}x${Math.round(result.height)}`);
          if (!result.reachable) problems.push(`${result.name} is covered by another element`);
        }
        expect(problems).toEqual([]);
      });
    });
  }
});
