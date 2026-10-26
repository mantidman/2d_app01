import { defineConfig, devices } from '@playwright/test';

// PW_CHROMIUM_PATH lets cloud sandboxes with a preinstalled browser skip `playwright install`.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const use = { launchOptions: { executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] } };

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', ...use },
  webServer: {
    command: 'npm run preview -- --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...use } },
    { name: 'mobile', use: { ...devices['Pixel 5'], ...use } },
  ],
});
