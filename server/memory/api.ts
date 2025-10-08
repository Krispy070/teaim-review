import { Router } from "express";
import type { Request, Response } from "express";
import { ingestDocs } from "./ingestors/docs";
import { ingestSlack } from "./ingestors/slack";
import { ingestCsvRelease } from "./ingestors/csv_release";
import { ingestMeetings } from "./ingestors/meetings";
import type { IngestStats } from "./ingestors/base";
import type { RedactionPolicy } from "./redact";
import { embedText } from "./embed";
import { pool } from "../db/client";
import { toVectorLiteral } from "./upsert";

type IngestHandler = (params: { project_id: string; payload: any; policy: RedactionPolicy }) => Promise<IngestStats>;

const SOURCE_HANDLERS: Record<"docs" | "slack" | "csv_release" | "meetings", IngestHandler> = {
  docs: ingestDocs,
  slack: ingestSlack,
  csv_release: ingestCsvRelease,
  meetings: ingestMeetings,
} as const;

type SourceType = keyof typeof SOURCE_HANDLERS;

type IngestRequestBody = {
  project_id?: string;
  source_type?: SourceType;
  payload?: any;
  policy?: RedactionPolicy;
};

type RetrieveRequestBody = {
  project_id?: string;
  query?: string;
  k?: number;
};

function resolvePolicy(policy?: RedactionPolicy): RedactionPolicy {
  const fallback = (process.env.TENANT_PII_POLICY as RedactionPolicy | undefined) ?? "standard";
  const normalized = policy ?? fallback;
  return normalized === "strict" || normalized === "off" ? normalized : "standard";
}

async function handleIngest(body: IngestRequestBody): Promise<IngestStats> {
  if (!body.project_id) {
    throw new Error("project_id required");
  }
  if (!body.source_type || !(body.source_type in SOURCE_HANDLERS)) {
    throw new Error("unsupported source_type");
  }

  const policy = resolvePolicy(body.policy);
  const handler = SOURCE_HANDLERS[body.source_type];

  return handler({
    project_id: body.project_id,
    payload: body.payload,
    policy,
  });
}

async function handleRetrieve(body: RetrieveRequestBody) {
  if (!body.project_id) {
    throw new Error("project_id required");
  }
  if (!body.query) {
    throw new Error("query required");
  }

  const [queryVector] = await embedText([body.query]);
  const vectorLiteral = toVectorLiteral(queryVector ?? []);
  const limit = Math.min(Math.max(body.k ?? 8, 1), 20);

  const { rows } = await pool.query(
    `
    SELECT id, text, source_type, lineage, 1 - (embedding <#> $1::vector) AS score
    FROM memory_items
    WHERE project_id = $2
    ORDER BY embedding <#> $1::vector
    LIMIT $3
  `,
    [vectorLiteral, body.project_id, limit]
  );

  return {
    contexts: rows.map(row => ({
      id: row.id,
      text: row.text,
      score: Number(row.score ?? 0),
      source_type: row.source_type,
      lineage: typeof row.lineage === "string" ? safeJsonParse(row.lineage) : row.lineage,
    })),
    debug: {
      mode: "vector-only",
    },
  };
}

function safeJsonParse(value: any) {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function createMemoryRouter(): Router {
  const router = Router();

  router.use((req, res, next) => {
    if (process.env.MEMORY_ENABLED !== "1") {
      return res.status(404).json({ error: "memory disabled" });
    }
    next();
  });

  router.post("/ingest", async (req: Request, res: Response) => {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "embedding disabled" });
    }

    try {
      const stats = await handleIngest(req.body as IngestRequestBody);
      const response: any = {
        inserted: stats.inserted,
        chunks: stats.chunkCount,
        tokens: stats.tokenCount,
        pii_tags_summary: stats.piiTagsSummary,
      };
      if (stats.warnings.length) {
        response.warnings = stats.warnings;
      }
      res.json(response);
    } catch (error: any) {
      const message = error?.message ?? "ingest failed";
      res.status(message.includes("required") || message.includes("unsupported") ? 400 : 500).json({ error: message });
    }
  });

  router.post("/retrieve", async (req: Request, res: Response) => {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "embedding disabled" });
    }

    try {
      const result = await handleRetrieve(req.body as RetrieveRequestBody);
      res.json(result);
    } catch (error: any) {
      const message = error?.message ?? "retrieve failed";
      res.status(message.includes("required") ? 400 : 500).json({ error: message });
    }
  });

  return router;
}
