import { APIRequestContext, Page, expect } from "@playwright/test";

/** Prefer setting PW_PROJECT_PATH like /projects/<YOUR_PROJECT_ID>/overview */
export const PROJECT_PATH = process.env.PW_PROJECT_PATH || "/projects/DEV/overview";

/** Consolidated auth: try PW_AUTH_TOKEN, else mint if dev route exists */
export async function mintDevToken(request: APIRequestContext) {
  if (process.env.PW_AUTH_TOKEN) return process.env.PW_AUTH_TOKEN;
  for (const route of ["/api/dev/token", "/api/dev/mint", "/api/test/token"]) {
    try {
      const r = await request.get(route);
      if (r.ok()) {
        const j = await r.json();
        if (j?.token) return j.token;
      }
    } catch {}
  }
  return null;
}

export async function primeBrowser(page: Page, token: string | null) {
  await page.addInitScript((tok) => {
    if (tok) localStorage.setItem("auth_token", tok as string);
  }, token);
}

export async function gotoProject(page: Page, subPath = "") {
  const base = PROJECT_PATH.replace(/\/$/, "");
  await page.goto(base + subPath);
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(/\/projects\//);
}

/** Formats yyyy-mm-dd for date inputs */
export const ymd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
