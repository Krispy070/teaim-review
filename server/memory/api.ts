import { Router } from "express";
import type { RetrieveInput } from "./retrieve";
import { retrieve, MemoryServiceError, isMemoryEnabled } from "./retrieve";

const router = Router();
const VALID_PHASES = new Set<RetrieveInput["phase"]>([
  "Discovery",
  "Design",
  "Build",
  "Test",
  "UAT",
  "Release",
  "Hypercare",
]);

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.post("/retrieve", async (req, res) => {
  if (!isMemoryEnabled()) {
    return res.status(503).json({ error: "memory disabled" });
  }

  const body = req.body ?? {};
  const projectId = typeof body.project_id === "string" ? body.project_id.trim() : "";
  const query = typeof body.query === "string" ? body.query.trim() : "";

  if (!projectId) {
    return res.status(400).json({ error: "project_id required" });
  }
  if (!query) {
    return res.status(400).json({ error: "query required" });
  }

  const input: RetrieveInput = {
    project_id: projectId,
    query,
  };

  if (body.k !== undefined) {
    const parsed = Number(body.k);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return res.status(400).json({ error: "k must be a positive number" });
    }
    input.k = parsed;
  }

  if (typeof body.phase === "string") {
    if (!VALID_PHASES.has(body.phase as RetrieveInput["phase"])) {
      return res.status(400).json({ error: "phase is invalid" });
    }
    input.phase = body.phase as RetrieveInput["phase"];
  }

  if (body.filters && typeof body.filters === "object") {
    const filters: RetrieveInput["filters"] = {};
    if (Array.isArray(body.filters.source_type)) {
      filters.source_type = body.filters.source_type
        .map((value: unknown) => (typeof value === "string" ? value : ""))
        .filter((value: string) => value.trim() !== "");
    }
    if (body.filters.since_days !== undefined) {
      const since = Number(body.filters.since_days);
      if (!Number.isFinite(since) || since < 0) {
        return res.status(400).json({ error: "since_days must be a positive number" });
      }
      filters.since_days = since;
    }
    input.filters = filters;
  }

  try {
    const result = await retrieve(input);
    res.json(result);
  } catch (error) {
    if (error instanceof MemoryServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("[memory] retrieve failed", error);
    return res.status(500).json({ error: "memory retrieval failed" });
  }
});

export default router;
