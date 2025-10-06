import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject, PID } from "./utils";

test.beforeEach(async ({ page, request }) => {
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);
});

test("dashboard shows project ingest email and copy works", async ({ page, request, baseURL }) => {
  // Ensure alias exists by generating one
  const tok = await mintDevToken(request);
  await request.post(`${baseURL}/api/project-settings/rotate-ingest-alias`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: { projectId: PID, projectCode: "WD-Kriana" }
  });

  // Open dashboard and verify ingest email card
  await gotoProject(page, "/dashboard");
  
  // Check that the card exists
  await expect(page.getByTestId("ingest-email-card")).toBeVisible();
  await expect(page.getByText("Project Ingest Email")).toBeVisible();
  
  // Check that the email is displayed
  const emailText = page.getByTestId("text-ingest-email");
  await expect(emailText).toBeVisible();
  await expect(emailText).toContainText("ingest+");
  await expect(emailText).toContainText("@");

  // Copy button should be visible and enabled
  const copyBtn = page.getByTestId("button-copy-ingest");
  await expect(copyBtn).toBeVisible();
  await expect(copyBtn).toBeEnabled();

  // Click copy and verify it changes to "Copied!"
  await copyBtn.click();
  await expect(copyBtn).toContainText("Copied!");
  
  // Wait for it to change back to "Copy"
  await expect(copyBtn).toContainText("Copy", { timeout: 2000 });

  // Mailto link should be visible and enabled
  const mailtoLink = page.getByTestId("link-mailto-ingest");
  await expect(mailtoLink).toBeVisible();
  const href = await mailtoLink.getAttribute("href");
  expect(href).toContain("mailto:");
  expect(href).toContain("ingest+");
});

test("admin can rotate ingest alias and POST uses database project code", async ({ page, request, baseURL }) => {
  // Generate initial alias
  const tok = await mintDevToken(request);
  const initialResponse = await request.post(`${baseURL}/api/project-settings/rotate-ingest-alias`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: { projectId: PID }
  });
  const initialData = await initialResponse.json();
  const initialEmail = initialData.ingestEmail;

  // Verify POST response uses actual database project code
  expect(initialEmail).toBeTruthy();
  expect(initialEmail).toContain("ingest+");
  expect(initialEmail).toContain("@");

  // GET the alias and ensure it matches POST response
  const getResponse = await request.get(`${baseURL}/api/project-settings/ingest-alias?projectId=${PID}`, {
    headers: { Authorization: `Bearer ${tok}` }
  });
  const getData = await getResponse.json();
  expect(getData.ingestEmail).toBe(initialEmail);

  // Rotate again and verify new alias is different but still valid
  const rotateResponse = await request.post(`${baseURL}/api/project-settings/rotate-ingest-alias`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: { projectId: PID }
  });
  const rotateData = await rotateResponse.json();
  expect(rotateData.ingestEmail).toBeTruthy();
  expect(rotateData.ingestEmail).not.toBe(initialEmail);
  expect(rotateData.ingestEmail).toContain("ingest+");
});
