import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject } from "./utils";
import fs from "node:fs";

test.beforeEach(async ({ page, request }) => {
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);
});

test("upload shows in list and is searchable", async ({ page }) => {
  await gotoProject(page, "/documents");

  const path = "tests/e2e_upload.txt";
  fs.writeFileSync(path, "Kronos WFM → Workday integration spec. Payroll parallel 2026-01-12.");

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path);
  await page.getByRole("button", { name: "Upload" }).click();

  await expect(page.getByText("e2e_upload.txt")).toBeVisible({ timeout: 15000 });

  await page.waitForTimeout(1500);
  await page.getByPlaceholder("Search your docs…").fill("Kronos integration");
  await page.getByRole("button", { name: "Search" }).click();

  const hasHit = await page.getByText(/score/).first().isVisible().catch(()=>false);
  expect(hasHit).toBeTruthy();
});
