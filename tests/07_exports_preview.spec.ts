import { test, expect } from "@playwright/test";
import fs from "fs";
import { nanoid } from "nanoid";

test.describe("CSV Exports and Document Preview", () => {
  let authToken: string;
  const projectId = "e1ec6ad0-a4e8-45dd-87b0-e123776ffe6e"; // Using existing test project

  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/dev/token");
    const json = await res.json();
    authToken = json.token;
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token: string) => {
      localStorage.setItem("sb-hixirmwsvbjyeecfclgx-auth-token", JSON.stringify({
        access_token: token,
        token_type: "bearer",
        expires_in: 3600
      }));
    }, authToken);
  });

  test("export actions CSV", async ({ page }) => {
    // Navigate to Actions page
    await page.goto(`/projects/${projectId}/actions`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Click export button
    const exportBtn = page.locator('[data-testid="button-export-actions-csv"]');
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    
    const downloadPromise = page.waitForEvent("download");
    await exportBtn.click();
    const download = await downloadPromise;

    // Verify CSV file
    const csvPath = await download.path();
    expect(csvPath).toBeTruthy();
    
    const csvContent = fs.readFileSync(csvPath!, "utf-8");
    expect(csvContent).toContain("id,title");
    console.log("Actions CSV exported successfully");
  });

  test("export test cases CSV", async ({ page }) => {
    // Navigate to Testing page  
    await page.goto(`/projects/${projectId}/tests`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Click export button
    const exportBtn = page.locator('button:has-text("Export Tests CSV")');
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    
    const downloadPromise = page.waitForEvent("download");
    await exportBtn.click();
    const download = await downloadPromise;

    // Verify CSV file
    const csvPath = await download.path();
    expect(csvPath).toBeTruthy();
    
    const csvContent = fs.readFileSync(csvPath!, "utf-8");
    expect(csvContent).toContain("id,title");
    console.log("Test cases CSV exported successfully");
  });

  test("verify document viewer with tabs", async ({ page }) => {
    // Navigate to documents list
    await page.goto(`/projects/${projectId}/docs`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Get first document
    const firstDoc = page.locator('[data-testid^="doc-row-"]').first();
    
    if (await firstDoc.isVisible()) {
      await firstDoc.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Verify tabs exist
      const chunksTab = page.locator('[data-testid="tab-chunks"]');
      await expect(chunksTab).toBeVisible({ timeout: 10000 });
      
      // Click chunks tab
      await chunksTab.click();
      await page.waitForTimeout(1000);
      
      // Verify chunks are displayed
      const chunks = page.locator('[data-testid^="chunk-"]');
      const chunksCount = await chunks.count();
      expect(chunksCount).toBeGreaterThan(0);
      
      console.log(`Document viewer verified with ${chunksCount} chunks`);
    }
  });
});
