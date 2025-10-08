import { Router } from "express";
import { MemoryError } from "./common";
import { recommendations } from "./recommend";
import { recordSignal, type Signal } from "./signals";

const router = Router();

router.use((req, res, next) => {
  if (process.env.MEMORY_ENABLED !== "1") {
    return res.status(404).json({ message: "Memory features are disabled" });
  }
  next();
});

router.post("/signals", async (req, res) => {
  try {
    await recordSignal(req.body as Signal);
    res.status(204).end();
  } catch (error: any) {
    if (error instanceof MemoryError) {
      return res.status(error.status).json({ message: error.message, detail: error.detail });
    }
    console.error("recordSignal failed", error);
    return res.status(500).json({ message: "Failed to record signal" });
  }
});

router.get("/recommendations", async (req, res) => {
  const projectId = String((req.query.project_id || req.query.projectId || "").toString());
  const phase = req.query.phase ? String(req.query.phase) : undefined;
  const k = req.query.k ? Number(req.query.k) : undefined;

  try {
    const items = await recommendations(projectId, { phase, k });
    res.json({ recommendations: items });
  } catch (error: any) {
    if (error instanceof MemoryError) {
      return res.status(error.status).json({ message: error.message, detail: error.detail });
    }
    console.error("recommendations failed", error);
    return res.status(500).json({ message: "Failed to load recommendations" });
  }
});

export default router;
