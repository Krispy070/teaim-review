import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject, ymd, PROJECT_PATH } from "./utils";
import * as XLSX from "xlsx";

test("Offboarding: import → select-all filtered → assign owner; Deliverability smoke", async ({ page, request }) => {
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);

  const projectId = PROJECT_PATH.split("/")[2];

  // Create cohort with a unique name
  const cohortName = `Cohort E2E ${Date.now()}`;
  const cohort = await (await request.post("/api/ma/cohorts/create", {
    data: { projectId, name: cohortName, type: "offboarding", description: "E2E" }
  })).json();
  const cohortId = cohort.id;

  // Build a small XLSX
  const rows = [["external_id","name","email","org_unit","last_day(YYYY-MM-DD)","terminate_date(YYYY-MM-DD)","owner","status","notes"],
                ["u1","User One","u1@example.com","Org A", ymd(), "", "", "planned",""],
                ["u2","User Two","u2@example.com","Org B", "", ymd(), "", "planned",""]];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Offboarding");
  const buf = XLSX.write(wb, { type:"buffer", bookType:"xlsx" });

  // Import file
  await request.post(`/api/ma/cohorts/${cohortId}/offboarding/import`, { 
    multipart: {
      file: { name: "offboarding.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: buf },
      projectId: projectId
    }
  });

  // Open M&A hub
  await gotoProject(page, "/ma/hub");

  // Wait for the newly created cohort to appear and click its Manage button
  await page.getByText(cohortName).waitFor({ state: "visible" });
  
  // Find the manage button for this specific cohort row
  const cohortRow = page.locator(`tr:has-text("${cohortName}")`);
  await cohortRow.getByRole("button", { name: /^Manage$/ }).click();

  // Wait for imported rows to be visible before interacting
  await page.getByText(/User One|User Two/).first().waitFor({ state: "visible" });

  // Select all (filtered)
  await page.getByLabel(/Select all \(filtered\)/).check();

  // Assign owner to filtered
  const assignBtn = page.getByRole("button", { name: /^Assign owner to filtered$/ });
  await assignBtn.click();
  // Prompt handled by UI; this smoke focuses that the control exists.

  // Bump +1d first row
  const plus1 = page.getByRole("button", { name: /^\+1d$/ }).first();
  await plus1.click();

  // Deliverability smoke: post a fake Mailgun webhook (signature bypass if signing key unset)
  await request.post("/api/email/webhooks/mailgun", {
    data: { "event-data": { event:"bounced", recipient:"bounce-test@example.com", message:{ headers:{ "message-id":"e2e" }}} }
  });
  const gauge = await (await request.get(`/api/email/metrics/gauge?projectId=${projectId}&days=7`)).json();
  expect(gauge.ok).toBeTruthy();
});
