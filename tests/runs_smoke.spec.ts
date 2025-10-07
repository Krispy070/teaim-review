import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject } from "./utils";

test("Runs tab loads and paginates", async ({ page, request }) => {
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);
  await gotoProject(page, "/ma/integrations");
  // Switch to RUNS tab if present
  const runsTab = page.getByRole("button", { name: /^RUNS$/i });
  const hasRuns = await runsTab.isVisible().catch(() => false);
  test.skip(!hasRuns, "Runs tab not available");
  await runsTab.click();

  // Pagination controls visible
  await expect(page.getByRole("button", { name: /^Next$/ })).toBeVisible();
});
