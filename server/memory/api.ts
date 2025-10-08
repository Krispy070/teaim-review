// server/memory/api.ts
import { Router, Request, Response } from "express";

// PR-3 retrieval (hybrid) + input types
import { retrieve, type RetrieveInput } from "./retrieve";

// PR-2 ingestors
import * as IngestDocs from "./ingestors/docs";
import * as IngestSlack from "./ingestors/slack";
import * as IngestCsv from "./ingestors/csv_release";
import * as IngestMeetings from "./ingestors/meetings";

const MEMORY_ENABLED = process.env.MEMORY_ENABLED === "1";
const EMBED_ENABLED = !!process.env.OPENAI_API_KEY;

export const memoryRouter = Router();

// ---- Health (from PR-1) -----------------------------------------------------
memoryRouter.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    ok: true,
    memoryEnabled: MEMORY_ENABLED,
    embedEnabled: EMBED_ENABLED,
  });
});

// ---- Retrieve (full hybrid from PR-3) ---------------------------------------
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
    if (!EMBED_ENABLED) return res.status(503).json({ ok: false, error: "embedding disabled (missing OPENAI_API_KEY)" });

    const body = (req.body ?? {}) as Partial<RetrieveInput>;
    const projectId = typeof body.project_id === "string" ? body.project_id.trim() : "";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const k = typeof body.k === "number" ? body.k : undefined;
    const phase = typeof body.phase === "string" && VALID_PHASES.has(body.phase as any) ? (body.phase as RetrieveInput["phase"]) : undefined;
    const filters = body.filters;

    if (!projectId) return res.status(400).json({ ok: false, error: "project_id required" });
    if (!query) return res.status(400).json({ ok: false, error: "query required" });

    const input: RetrieveInput = { project_id: projectId, query, k, phase, filters };
    const out = await retrieve(input);

    return res.status(200).json({ ok: true, ...out });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

// ---- Ingest (from PR-2) -----------------------------------------------------
/**
 * Body: {
 *   project_id: string;
 *   source_type: "docs"|"slack"|"csv_release"|"meetings";
 *   payload: any;
 *   policy?: "strict"|"standard"|"off";
 * }
 */
memoryRouter.post("/ingest", async (req: Request, res: Response) => {
  try {
    if (!MEMORY_ENABLED) return res.status(503).json({ ok: false, error: "memory disabled" });
    if (!EMBED_ENABLED) return res.status(503).json({ ok: false, error: "embedding disabled (missing OPENAI_API_KEY)" });

    const { project_id, source_type, payload, policy } = req.body ?? {};
    if (!project_id || !source_type)
      return res.status(400).json({ ok: false, error: "project_id and source_type are required" });

    const policyNorm: "strict" | "standard" | "off" =
      policy === "strict" || policy === "off" ? policy : "standard";

    let result: any;
    switch (source_type) {
      case "docs":
        result = await IngestDocs.ingest({ project_id, payload, policy: policyNorm });
        break;
      case "slack":
        result = await IngestSlack.ingest({ project_id, payload, policy: policyNorm });
        break;
      case "csv_release":
        result = await IngestCsv.ingest({ project_id, payload, policy: policyNorm });
        break;
      case "meetings":
        result = await IngestMeetings.ingest({ project_id, payload, policy: policyNorm });
        break;
      default:
        return res.status(400).json({ ok: false, error: `unsupported source_type: ${source_type}` });
    }

    return res.status(200).json({ ok: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});
