import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject } from "./utils";

test.beforeEach(async ({ page, request }) => {
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);
});

test("Timeline Events renders list/Gantt with readable labels", async ({ page }) => {
  await gotoProject(page, "/insights/timeline");
  await expect(page.getByRole("heading", { name: "Timeline" }).or(page.getByText("Timeline Events"))).toBeVisible();

  const anyLabel = await page.locator("text=Discovery").first().isVisible().catch(()=>false);
  expect(anyLabel).toBeTruthy();
});

test("Actions + Test Cases pages load", async ({ page }) => {
  await gotoProject(page, "/insights/actions");
  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();

  await gotoProject(page, "/insights/tests");
  await expect(page.getByRole("heading", { name: "Testing" })).toBeVisible();
});
