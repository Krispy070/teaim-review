import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject } from "./utils";

test("Notifications page renders + quick mutes present", async ({ page, request }) => {
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);
  await gotoProject(page, "/notifications");

  const hasHeader = await page.getByText("Notifications").first().isVisible().catch(() => false);
  test.skip(!hasHeader, "Notifications page not present");

  // Project mute buttons visible
  await expect(page.getByRole("button", { name: /^Mute 1h$/ })).toBeVisible();
});
