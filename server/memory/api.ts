// server/memory/api.ts
import type { Request, Response } from "express";
import { Router } from "express";

// Retrieval (PR-3)
import { retrieve, type RetrieveInput } from "./retrieve";

// Ingestors (PR-2)
import * as IngestDocs from "./ingestors/docs";
import * as IngestSlack from "./ingestors/slack";
import * as IngestCsv from "./ingestors/csv_release";
import * as IngestMeetings from "./ingestors/meetings";

// Signals + Recommendations (PR-4)
import { recordSignal, type Signal } from "./signals";
import { recommendations } from "./recommend";

const MEMORY_ENABLED = process.env.MEMORY_ENABLED === "1";
const EMBED_ENABLED = !!process.env.OPENAI_API_KEY;

const isSchemaNotReadyError = (err: unknown) => {
  const code = typeof err === "object" && err && "code" in err ? (err as any).code : undefined;
  return code === "42P01" || code === "42P10";
};

const handleMemoryError = (res: Response, err: any) => {
  if (isSchemaNotReadyError(err)) {
    return res.status(503).json({ ok: false, error: "memory schema not ready" });
  }

  return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
};

export const memoryRouter = Router();

/* ---------------------------- Health (PR-1) ---------------------------- */
memoryRouter.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    ok: true,
    memoryEnabled: MEMORY_ENABLED,
    embedEnabled: EMBED_ENABLED,
  });
});

/* ---------------------- Retrieve (PR-3: hybrid) ----------------------- */
const VALID_PHASES: Set<NonNullable<RetrieveInput["phase"]>> = new Set([
  "Discovery",
  "Design",
  "Build",
  "Test",
  "UAT",
  "Release",
  "Hypercare",
]);

memoryRouter.post("/retrieve", async (req: Request, res: Response) => {
  try {
    if (!MEMORY_ENABLED) return res.status(503).json({ ok: false, error: "memory disabled" });
    if (!EMBED_ENABLED) return res.status(503).json({ ok: false, error: "embedding disabled" });

    const body = (req.body ?? {}) as Partial<RetrieveInput>;
    const project_id = typeof body.project_id === "string" ? body.project_id.trim() : "";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const k = typeof body.k === "number" ? body.k : undefined;
    const phase =
      typeof body.phase === "string" && VALID_PHASES.has(body.phase as any)
        ? (body.phase as RetrieveInput["phase"])
        : undefined;

    if (!project_id) return res.status(400).json({ ok: false, error: "project_id required" });
    if (!query) return res.status(400).json({ ok: false, error: "query required" });

    try {
      const out = await retrieve({ project_id, query, k, phase, filters: body.filters });
      return res.status(200).json({ ok: true, ...out });
    } catch (err: any) {
      return handleMemoryError(res, err);
    }
  } catch (err: any) {
    return handleMemoryError(res, err);
  }
});

/* ---------------------- Ingest (PR-2: pipeline) ----------------------- */
// helper: accept either named export {ingest} or default export
const pickIngest = (mod: any): undefined | ((args: any) => Promise<any>) =>
  (mod && (mod.ingest || mod.default)) as any;

memoryRouter.post("/ingest", async (req: Request, res: Response) => {
  try {
    if (!MEMORY_ENABLED) return res.status(503).json({ ok: false, error: "memory disabled" });
    if (!EMBED_ENABLED) return res.status(503).json({ ok: false, error: "embedding disabled" });

    const { project_id, source_type, payload, policy } = (req.body ?? {}) as {
      project_id?: string;
      source_type?: "docs" | "slack" | "csv_release" | "meetings";
      payload?: any;
      policy?: "strict" | "standard" | "off";
    };

    if (!project_id || !source_type)
      return res.status(400).json({ ok: false, error: "project_id and source_type are required" });

    const policyNorm: "strict" | "standard" | "off" =
      policy === "strict" || policy === "off" ? policy : "standard";

    let result: any;
    try {
      switch (source_type) {
        case "docs": {
          const fn = pickIngest(IngestDocs);
          if (typeof fn !== "function")
            return res.status(500).json({ ok: false, error: "docs ingestor not available" });
          result = await fn({ project_id, payload, policy: policyNorm });
          break;
        }
        case "slack": {
          const fn = pickIngest(IngestSlack);
          if (typeof fn !== "function")
            return res.status(500).json({ ok: false, error: "slack ingestor not available" });
          result = await fn({ project_id, payload, policy: policyNorm });
          break;
        }
        case "csv_release": {
          const fn = pickIngest(IngestCsv);
          if (typeof fn !== "function")
            return res.status(500).json({ ok: false, error: "csv_release ingestor not available" });
          result = await fn({ project_id, payload, policy: policyNorm });
          break;
        }
        case "meetings": {
          const fn = pickIngest(IngestMeetings);
          if (typeof fn !== "function")
            return res.status(500).json({ ok: false, error: "meetings ingestor not available" });
          result = await fn({ project_id, payload, policy: policyNorm });
          break;
        }
        default:
          return res
            .status(400)
            .json({ ok: false, error: `unsupported source_type: ${source_type}` });
      }

      return res.status(200).json({ ok: true, ...result });
    } catch (err: any) {
      return handleMemoryError(res, err);
    }
  } catch (err: any) {
    return handleMemoryError(res, err);
  }
});

/* ------------------ Recommendations (PR-4: miner) --------------------- */
// GET /api/memory/recommendations?project_id=...&phase=UAT
memoryRouter.get("/recommendations", async (req: Request, res: Response) => {
  try {
    if (!MEMORY_ENABLED) return res.status(503).json({ ok: false, error: "memory disabled" });

    const project_id = String(req.query.project_id ?? "").trim();
    const phase = typeof req.query.phase === "string" ? req.query.phase : undefined;

    if (!project_id) return res.status(400).json({ ok: false, error: "project_id required" });

    const list = await recommendations(project_id, { phase: phase as any });
    return res.status(200).json({ ok: true, recommendations: list });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

/* ------------------------- Signals (PR-4) ----------------------------- */
// POST /api/memory/signals  { project_id, kind, ... }
memoryRouter.post("/signals", async (req: Request, res: Response) => {
  try {
    if (!MEMORY_ENABLED) return res.status(503).json({ ok: false, error: "memory disabled" });

    const s = (req.body ?? {}) as Partial<Signal>;
    if (!s.project_id || !s.kind)
      return res.status(400).json({ ok: false, error: "project_id and kind are required" });

    await recordSignal({
      project_id: String(s.project_id),
      kind: s.kind as Signal["kind"],
      severity: s.severity,
      owner: s.owner,
      event_ts: s.event_ts ?? new Date().toISOString(),
      features: s.features ?? {},
      outcome: s.outcome ?? {},
    });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

// default export: import memoryRoutes from "./memory/api";
export default memoryRouter;
