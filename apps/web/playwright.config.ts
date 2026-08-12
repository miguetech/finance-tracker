import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  webServer: { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true }
})
