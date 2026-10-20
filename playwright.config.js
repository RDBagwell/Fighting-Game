// Playwright: smoke tests and screenshots against the production build.
//
//   npm run build && npm run build:e2e && npm run test:e2e     smoke tests
//   npm run build && npm run screenshots  regenerate docs/screenshots/
//
// Tests wait on game state (window.__game), never on wall-clock time alone.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173/' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } }],
  webServer: [
    {
      command: 'npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173/',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    // Online tests: a build that talks to a local matchmaking server
    // (npm run build:e2e), and that server, accepting only that origin.
    {
      command: 'npx vite preview --outDir dist-e2e --port 4174 --strictPort',
      url: 'http://localhost:4174/',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'node server/index.js',
      url: 'http://localhost:3000/healthz',
      env: { PORT: '3000', ALLOWED_ORIGINS: 'http://localhost:4174', NODE_ENV: 'development' },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
