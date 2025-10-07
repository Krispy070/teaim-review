import { Router } from "express";

export const pub = Router();

pub.get("/healthz", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

pub.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(`User-agent: *\nAllow: /\n`);
});
