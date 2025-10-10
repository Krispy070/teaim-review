import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.SMOKE_PORT || 4173);

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    trace: "on-first-retry",
  },
  webServer: {
    command: `pnpm exec vite build && pnpm exec vite preview --host 0.0.0.0 --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_DEV_AUTH: "1",
      VITE_DEV_ROLE: "admin",
      VITE_DEV_USER: "00000000-0000-4000-a000-000000000001",
      VITE_DEV_ORG: "00000000-0000-4000-a000-000000000002",
    },
  },
});
