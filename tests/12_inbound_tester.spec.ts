import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject } from "./utils";
import * as fs from "fs";
import * as path from "path";

test.beforeEach(async ({ page, request }) => {
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);
});

test("admin sees inbound email tester card on TeamPage and can submit test file", async ({ page, request, baseURL }) => {
  await gotoProject(page, "/team");

  const card = page.getByTestId("inbound-tester-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Email Ingest Tester (Admin)");

  const fileInput = page.getByTestId("input-inbound-file");
  await expect(fileInput).toBeVisible();

  const sendBtn = page.getByTestId("button-send-inbound");
  await expect(sendBtn).toBeVisible();

  const testFilePath = path.join(__dirname, "fixtures", "test.txt");
  fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
  fs.writeFileSync(testFilePath, "Test email attachment content for inbound verification");

  await fileInput.setInputFiles(testFilePath);
  await sendBtn.click();

  const statusText = page.getByTestId("text-inbound-status");
  await expect(statusText).toContainText("OK:", { timeout: 10000 });
  await expect(statusText).toContainText("docId");

  fs.unlinkSync(testFilePath);
});
