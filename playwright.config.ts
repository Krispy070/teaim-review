import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: { timeout: 6_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.PW_BASE_URL || "http://localhost:5000",
    headless: true,
    trace: "retain-on-failure",
  },
});
