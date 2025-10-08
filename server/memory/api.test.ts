import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { memoryRouter } from "./api";

test("GET /api/memory/health returns a TODO stub", async () => {
  const app = express();
  app.use("/api/memory", memoryRouter);

  const server = app.listen(0);
  const address = server.address() as AddressInfo;

  try {
    const res = await fetch(`http://127.0.0.1:${address.port}/api/memory/health`);
    assert.equal(res.status, 200);

    const body = (await res.json()) as { todo?: string };
    assert.equal(body?.todo, "Memory service health check");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
