import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject, ymd } from "./utils";
import * as XLSX from "xlsx";

test("Releases: import → analyze → test pack → schedule review", async ({ page, request }) => {
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);

  // Go to Releases page
  await gotoProject(page, "/releases");

  // Prepare a tiny CSV file (XLSX can read CSV buffers)
  const data = [
    ["Area", "Change"],
    ["Payroll Calc", "Net pay rounding logic clarified"],
    ["Absence", "Carryover rule update"]
  ];
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(data));
  const file = { name: "release_notes.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") };

  // Fill import controls
  await page.getByRole("combobox").first().selectOption("R1");
  await page.getByRole("spinbutton").first().fill(String(new Date().getUTCFullYear()));
  await page.getByLabel(/file/i).setInputFiles(file);

  await page.getByRole("button", { name: /^Import$/ }).click();
  await expect(page).toHaveTitle(/Releases/i);

  // Click Analyze on the top card
  const analyzeBtn = page.getByRole("button", { name: /^Analyze$/ }).first();
  await analyzeBtn.click();

  // Generate tests
  await page.getByRole("button", { name: /^Generate tests$/ }).first().click();

  // Open drawer & check gate chip appears (Req x/y)
  await page.getByRole("button", { name: /^Open$/ }).first().click();
  await expect(page.getByText(/^Req \d+\/\d+/).first()).toBeVisible();

  // Schedule review (tomorrow)
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  await page.getByRole("button", { name: /^Schedule review$/ }).first().click();
  await page.waitForTimeout(300); // allow prompt popups in UI test harness
  // If your UI uses prompts, this step gets handled by the app; otherwise skip.

  // Close drawer
  await page.getByRole("button", { name: /^Close$/ }).click();

  // Verify list shows required chip
  await expect(page.getByText(/Req \d+\/\d+/).first()).toBeVisible();
});
