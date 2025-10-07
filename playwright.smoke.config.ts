import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 15_000,
  reporter: [["list"]],
  use: {
    headless: true,
  },
});
