// server/memory/api.ts
import type { Request, Response } from "express";
import { Router } from "express";

// PR-3: full retrieval API + types
import { retrieve, type RetrieveInput } from "./retrieve";

// PR-2: ingestors (we’ll handle default/named export differences safely)
import * as IngestDocs from "./ingestors/docs";
import * as IngestSlack from "./ingestors/slack";
import * as IngestCsv from "./ingestors/csv_release";
import * as IngestMeetings from "./ingestors/meetings";

const MEMORY_ENABLED = process.env.MEMORY_ENABLED === "1";
const EMBED_ENABLED = !!process.env.OPENAI_API_KEY;

export const memoryRouter = Router();

/* ----------------------------------------------------------------------------
 * Health (from PR-1)
 * Always available for smoke checks; reports feature flag & embedding key.
 * --------------------------------------------------------------------------*/
memoryRouter.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    ok: true,
    memoryEnabled: MEMORY_ENABLED,
    embedEnabled: EMBED_ENABLED,
  });
});

/* ----------------------------------------------------------------------------
 * Retrieve (PR-3: hybrid ranker)
 * Body: { project_id: string; query: string; k?: number; phase?: string; filters?: {...} }
 * --------------------------------------------------------------------------*/
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
    if (!MEMORY_ENABLED) {
      return res.status(503).json({ ok: false, error: "memory disabled" });
    }
    if (!EMBED_ENABLED) {
      return res
        .status(503)
        .json({ ok: false, error: "embedding disabled (missing OPENAI_API_KEY)" });
    }

    const body = (req.body ?? {}) as Partial<RetrieveInput>;
    const projectId =
      typeof body.project_id === "string" ? body.project_id.trim() : "";
    const query =
      typeof body.query === "string" ? body.query.trim() : "";
    const k = typeof body.k === "number" ? body.k : undefined;
    const phase =
      typeof body.phase === "string" && VALID_PHASES.has(body.phase as any)
        ? (body.phase as RetrieveInput["phase"])
        : undefined;
    const filters = body.filters;

    if (!projectId)
      return res.status(400).json({ ok: false, error: "project_id required" });
    if (!query)
      return res.status(400).json({ ok: false, error: "query required" });

    const input: RetrieveInput = { project_id: projectId, query, k, phase, filters };
    const out = await retrieve(input);

    return res.status(200).json({ ok: true, ...out });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, error: err?.message ?? String(err) });
  }
});

/* ----------------------------------------------------------------------------
 * Ingest (PR-2)
 * Body: {
 *   project_id: string;
 *   source_type: "docs"|"slack"|"csv_release"|"meetings";
 *   payload: any;
 *   policy?: "strict"|"standard"|"off";
 * }
 * --------------------------------------------------------------------------*/

// helper: works whether module exports {ingest} or default
const pickIngest = (mod: any): undefined | ((args: any) => Promise<any>) =>
  (mod && (mod.ingest || mod.default)) as any;

memoryRouter.post("/ingest", async (req: Request, res: Response) => {
  try {
    if (!MEMORY_ENABLED) {
      return res.status(503).json({ ok: false, error: "memory disabled" });
    }
    if (!EMBED_ENABLED) {
      return res
        .status(503)
        .json({ ok: false, error: "embedding disabled (missing OPENAI_API_KEY)" });
    }

    const { project_id, source_type, payload, policy } = (req.body ?? {}) as {
      project_id?: string;
      source_type?: string;
      payload?: any;
      policy?: "strict" | "standard" | "off";
    };

    if (!project_id || !source_type) {
      return res
        .status(400)
        .json({ ok: false, error: "project_id and source_type are required" });
    }

    const policyNorm: "strict" | "standard" | "off" =
      policy === "strict" || policy === "off" ? policy : "standard";

    let result: any;

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
    return res
      .status(500)
      .json({ ok: false, error: err?.message ?? String(err) });
  }
});

// default export so other code can: import memoryRoutes from "./memory/api";
export default memoryRouter;
