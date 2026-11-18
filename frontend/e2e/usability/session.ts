import { test } from '../fixtures';
import { usabilityOverrides, openUsabilitySession } from '../usability-fixtures';

test.use({ conditionOverrides: usabilityOverrides });

test('Manual synthetic O4 session — no participant results are collected', async ({ page, context }) => {
  await openUsabilitySession(page, context);
  console.log('SYNTHETIC O4 SESSION: frozen clock 2026-11-13 12:00 UTC; no live source requests.');
  console.log('Use tests/usability/tasks.json. Map tiles are blank offline placeholders.');
  console.log('No recordings or participant results are saved. Close the main application tab when finished.');
  await page.waitForEvent('close', { timeout: 0 });
});
