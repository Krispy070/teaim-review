// server/memory/api.ts
import { Router, Request, Response } from "express";

const MEMORY_ENABLED = process.env.MEMORY_ENABLED === "1";
const EMBED_ENABLED = !!process.env.OPENAI_API_KEY;

// PR-2 deps
import { redact } from "./redact"; // used by ingestors as needed (kept here for tree shaking hints)
import * as IngestDocs from "./ingestors/docs";
import * as IngestSlack from "./ingestors/slack";
import * as IngestCsv from "./ingestors/csv_release";
import * as IngestMeetings from "./ingestors/meetings";
import { retrieve as doRetrieve } from "./retrieve";

export const memoryRouter = Router();

/**
 * Health (kept from PR-1)
 * Always available for smoke checks; returns whether memory is enabled.
 */
memoryRouter.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    ok: true,
    memoryEnabled: MEMORY_ENABLED,
    embedEnabled: EMBED_ENABLED,
  });
});

/**
 * Ingest endpoint (PR-2)
 * Body: { project_id: string; source_type: "docs"|"slack"|"csv_release"|"meetings"; payload: any; policy?: "strict"|"standard"|"off" }
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

/**
 * Retrieve endpoint (PR-2)
 * Body: { project_id: string; query: string; k?: number; phase?: string; filters?: {...} }
 */
memoryRouter.post("/retrieve", async (req: Request, res: Response) => {
  try {
    if (!MEMORY_ENABLED) return res.status(503).json({ ok: false, error: "memory disabled" });
    if (!EMBED_ENABLED) return res.status(503).json({ ok: false, error: "embedding disabled (missing OPENAI_API_KEY)" });

    const { project_id, query, k, phase, filters } = req.body ?? {};
    if (!project_id || !query)
      return res.status(400).json({ ok: false, error: "project_id and query are required" });

    const out = await doRetrieve({ project_id, query, k, phase, filters });
    return res.status(200).json({ ok: true, ...out });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

