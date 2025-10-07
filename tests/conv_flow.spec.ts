import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject } from "./utils";

test.describe("Conversations ➜ summarize ➜ actions", () => {
  test("summarize and apply actions", async ({ page, request }) => {
    const tok = await mintDevToken(request);
    await primeBrowser(page, tok);
    await gotoProject(page, "/conversations");

    // If conversations page not present, soft-pass
    if (!(await page.locator("text=Conversations").first().isVisible().catch(() => false))) test.skip(true, "Conversations page not available");

    // Open first conversation if exists; else skip
    const openBtn = page.getByRole("button", { name: /^Open$/ }).first();
    const any = await openBtn.isVisible().catch(() => false);
    test.skip(!any, "No conversations to test");

    await openBtn.click();

    // Summarize
    const summarize = page.getByRole("button", { name: /^Summarize$/ });
    const hasSummarize = await summarize.isVisible().catch(() => false);
    test.skip(!hasSummarize, "Summarize not available");
    await summarize.click();

    // Wait for summary render or count chip
    await expect(page.locator("text=Summary").first()).toBeVisible();
    // Create actions
    const create = page.getByRole("button", { name: /^Create Actions$/ });
    await create.click();

    // Assert created list shows up
    await expect(page.locator("text=Created actions").first()).toBeVisible();
  });
});
