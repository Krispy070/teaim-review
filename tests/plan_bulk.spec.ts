import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject, ymd, PROJECT_PATH } from "./utils";

test("Plan: push onboarding → bulk set status/owner → export filtered CSV", async ({ page, request }) => {
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);

  // Seed onboarding & add tasks via API, then push to Plan
  const projectId = PROJECT_PATH.split("/")[2];
  await request.post("/api/onboarding/seed", { data: { projectId } });

  // Fetch steps
  const steps = await (await request.get(`/api/onboarding?projectId=${projectId}`)).json();
  const stepId = steps.steps[0].id;

  // Add a couple of tasks
  await request.post("/api/onboarding/task/upsert", { data: { projectId, stepId, title: "Define KPIs", owner: "pm@acme.com", dueAt: new Date().toISOString() }});
  await request.post("/api/onboarding/task/upsert", { data: { projectId, stepId, title: "Ownership kickoff", owner: "lead@acme.com", dueAt: new Date().toISOString() }});

  // Push to plan
  await request.post("/api/onboarding/push-to-plan", { data: { projectId, stepId }});

  // Open Plan
  await gotoProject(page, "/plan");
  await page.waitForSelector("table");

  // Select all (filtered)
  await page.getByLabel(/Select all \(filtered\)/).check();

  // Bulk: Set status → in_progress
  await page.getByTestId("select-bulk-status").selectOption("in_progress");
  await page.getByTestId("button-set-status").click();

  // Bulk: Set owner = me
  const setOwnerBtn = page.getByRole("button", { name: /^Set owner = me$/ });
  if (await setOwnerBtn.isVisible()) await setOwnerBtn.click();

  // Export filtered CSV
  const exportBtn = page.getByRole("link", { name: /^Export filtered CSV$/ });
  await expect(exportBtn).toBeVisible();
});
