import { Router } from "express";

export const memory = Router();

memory.post("/telemetry", (req, res) => {
  const { projectId, project_id, phase, action, promptId, memoryId, confidence } = req.body || {};

  if (!projectId && !project_id) {
    return res.status(400).json({ error: "projectId required" });
  }

  if (!action) {
    return res.status(400).json({ error: "action required" });
  }

  // Stub analytics sink — intentionally lightweight and PII-free.
  (req as any).log?.info?.({
    scope: "memory-telemetry",
    action,
    phase,
    projectId: projectId || project_id,
    promptId: promptId || memoryId || null,
    confidence: typeof confidence === "number" ? confidence : undefined,
  });

  return res.json({ ok: true });
});

export default memory;
