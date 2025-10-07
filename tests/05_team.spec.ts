import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject, PID } from "./utils";

test.beforeEach(async ({ page, request }) => {
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);
});

test("bootstrap admin and invite member", async ({ page, request, baseURL }) => {
  await gotoProject(page, "/team");

  const email = `qa+${Date.now()}@example.com`;
  const invite = await request.post(`${baseURL}/api/projects/members/add`, {
    data: { projectId: PID, email, role: "member" },
    headers: { Authorization: `Bearer ${await mintDevToken(request)}` }
  });

  if (invite.status() === 403) {
    await request.post(`${baseURL}/api/projects/members/bootstrap`, {
      data: { projectId: PID },
      headers: { Authorization: `Bearer ${await mintDevToken(request)}` }
    });
    const retry = await request.post(`${baseURL}/api/projects/members/add`, {
      data: { projectId: PID, email, role: "member" },
      headers: { Authorization: `Bearer ${await mintDevToken(request)}` }
    });
    expect(retry.ok()).toBeTruthy();
  } else {
    expect(invite.ok()).toBeTruthy();
  }

  await gotoProject(page, "/team");
  await expect(page.getByText(email)).toBeVisible();
});
