import { Router } from "express";

const dev = Router();

dev.get("/dev/token", (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "not_available" });
  }
  res.json({ ok:true, token: "dev-e2e-token" });
});

export default dev;
