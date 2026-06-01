import { defineConfig } from 'vitest/config'

// Unit tests cover pure logic only, so they run in plain Node without the
// Cloudflare plugin. Browser behaviour is covered by Playwright (tests/e2e).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
  },
})
