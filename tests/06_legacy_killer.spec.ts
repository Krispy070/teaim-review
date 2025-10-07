import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser } from "./utils";

test.beforeEach(async ({ page, request }) => {
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);
});

test("old widgets not visible anywhere", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).not.toHaveTitle(/Wellness|Program Timeline|Old Dashboard/i);
  await expect(page.getByText("Program Timeline")).toHaveCount(0);
  await expect(page.getByText("Team Wellness")).toHaveCount(0);
});
