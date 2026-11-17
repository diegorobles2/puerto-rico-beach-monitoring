import { defineConfig } from '@playwright/test';
import config from './playwright.config';

if (process.env.CI) throw new Error('Manual usability sessions are disabled in CI. Run the automated fixture checks instead.');

export default defineConfig({
  ...config,
  testMatch: '**/usability/session.ts',
  timeout: 0,
  reporter: 'list',
  use: { ...config.use, headless: false, trace: 'off', screenshot: 'off', video: 'off' },
});
