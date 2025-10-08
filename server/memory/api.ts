import { Router } from "express";

export const memoryRouter = Router();

memoryRouter.post("/ingest", (_req, res) => {
  res.status(200).json({ todo: "Implement memory ingest" });
});

memoryRouter.post("/retrieve", (_req, res) => {
  res.status(200).json({ todo: "Implement memory retrieval" });
});

memoryRouter.get("/health", (_req, res) => {
  res.status(200).json({ todo: "Memory service health check" });
});
