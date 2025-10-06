import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser } from "./utils";

test("HTTP mock receiver echoes", async ({ request }) => {
  const tok = await mintDevToken(request);
  const r = await request.post("/mock/receiver?mode=ok", {
    headers: { Authorization: tok ? `Bearer ${tok}` : "" },
    data: { hello: "world" },
  });
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.ok).toBeTruthy();
  expect(j.bodyLength).toBeGreaterThan(0);
});

test("SFTP localfs seed", async ({ request }) => {
  const r = await request.post("/mock/sftp/seed?host=local");
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(Array.isArray(j.created)).toBeTruthy();
});
