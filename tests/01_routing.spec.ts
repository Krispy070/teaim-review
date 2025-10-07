import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject } from "./utils";

test.beforeEach(async ({ page, request }) => {
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);
});

test("legacy admin paths redirect to live dashboard", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/projects\/.*\/dashboard$/);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/projects\/.*\/dashboard$/);

  await expect(page.getByRole("link", { name: "Documents" })).toHaveAttribute("href", /\/projects\/.*\/documents$/);
});
