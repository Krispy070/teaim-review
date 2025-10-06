import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject, PID } from "./utils";
import fs from "node:fs";
import path from "node:path";

test("comprehensive: upload → list → search → insights → dashboard", async ({ page, request, baseURL }) => {
  // 1) Get dev token & prime browser
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);

  // 2) Navigate to documents page
  await gotoProject(page, "/documents");
  await expect(page.getByTestId("heading-docs")).toBeVisible({ timeout: 10000 });

  // 3) Create a temp file with content that will generate insights
  const tmpPath = path.join("tests", "tmp-e2e-comprehensive.txt");
  const fileContent = `TEAIM Comprehensive Test Document
  
Project Timeline:
- Discovery phase: January 15, 2025 to February 28, 2025
- Design phase: March 1, 2025 to April 30, 2025
- Build phase: May 1, 2025 to July 31, 2025

Action Items:
- Review payroll configuration by end of month
- Complete security assessment for HR module
- Schedule training sessions for end users

Decisions Made:
- Selected cloud-hosted deployment model
- Approved integration with existing time tracking system

Test Cases:
- Verify employee onboarding workflow
- Test payroll calculation accuracy
- Validate security permissions`;

  fs.writeFileSync(tmpPath, fileContent);

  // 4) Upload the file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(tmpPath);
  await page.getByTestId("button-upload").click();

  // 5) Wait for upload to complete and verify it appears in the list
  await expect(page.getByText("tmp-e2e-comprehensive.txt")).toBeVisible({ timeout: 15000 });

  // 6) Switch to search tab and verify semantic search works
  await page.getByTestId("tab-search").click();
  await page.getByTestId("input-search-query").fill("payroll configuration");
  await page.getByTestId("button-search").click();
  
  await expect(page.getByTestId("search-results")).toBeVisible({ timeout: 10000 });
  const results = page.getByTestId(/result-/);
  await expect(results.first()).toBeVisible();

  // 7) Wait for insights extraction to complete (background processing)
  // Give the parseWorker time to extract insights from the uploaded document
  await page.waitForTimeout(3000);

  // 8) Navigate to Timeline insights and verify events appear
  await gotoProject(page, "/insights/timeline");
  await expect(page.getByRole("heading", { name: /Timeline/i })).toBeVisible();
  // Check that at least some timeline content is visible (extracted phases)
  const hasTimelineContent = await page.locator("text=/Discovery|Design|Build/i").first().isVisible().catch(() => false);
  expect(hasTimelineContent).toBeTruthy();

  // 9) Navigate to Actions insights and verify actions appear
  await gotoProject(page, "/insights/actions");
  await expect(page.getByRole("heading", { name: /Actions/i })).toBeVisible();
  // Check that action items were extracted
  const hasActions = await page.locator("text=/payroll|security|training/i").first().isVisible().catch(() => false);
  expect(hasActions).toBeTruthy();

  // 10) Navigate to Decisions insights and verify extracted decisions appear
  await gotoProject(page, "/insights/decisions");
  await expect(page.getByRole("heading", { name: /Decisions/i })).toBeVisible();
  // Check that decisions were extracted (cloud-hosted, integration)
  const hasDecisions = await page.locator("text=/cloud-hosted|integration|time tracking/i").first().isVisible().catch(() => false);
  expect(hasDecisions).toBeTruthy();

  // 11) Navigate to Test Cases insights and verify extracted tests appear
  await gotoProject(page, "/insights/tests");
  await expect(page.getByRole("heading", { name: /Test/i })).toBeVisible();
  // Check that test cases were extracted (onboarding, payroll, security)
  const hasTests = await page.locator("text=/onboarding|payroll|security|permissions/i").first().isVisible().catch(() => false);
  expect(hasTests).toBeTruthy();

  // 12) Navigate to dashboard and verify REAL tiles show up
  await gotoProject(page, "/dashboard");
  await expect(page.getByRole("heading", { name: /Project Overview/i })).toBeVisible();
  
  // Verify the real dashboard tiles (not dummy data)
  await expect(page.getByText("Documents")).toBeVisible();
  await expect(page.getByText("Storage")).toBeVisible();
  await expect(page.getByText("Actions")).toBeVisible();
  await expect(page.getByText("Tests")).toBeVisible();

  // Verify dashboard sections show real data
  await expect(page.getByText("Recent Documents")).toBeVisible();
  await expect(page.getByText("Latest Actions")).toBeVisible();
  await expect(page.getByText("Upcoming Timeline")).toBeVisible();

  // 13) Verify NO dummy data appears
  const hasDummyData = await page.getByText("Total Actions: 45").isVisible().catch(() => false);
  expect(hasDummyData).toBeFalsy();

  // Clean up temp file
  if (fs.existsSync(tmpPath)) {
    fs.unlinkSync(tmpPath);
  }
});
