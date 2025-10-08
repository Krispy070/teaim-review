import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { clampText, ensureTable, MemoryError } from "./common";

export type SignalKind =
  | "delay"
  | "dependency"
  | "approval_latency"
  | "defect_escape"
  | "scope_change";

export type SignalSeverity = "low" | "med" | "high";

export type Signal = {
  project_id: string;
  kind: SignalKind;
  severity?: SignalSeverity;
  owner?: string;
  event_ts?: string;
  features?: Record<string, any>;
  outcome?: Record<string, any>;
};

const KIND_SET = new Set<SignalKind>([
  "delay",
  "dependency",
  "approval_latency",
  "defect_escape",
  "scope_change",
]);

const SEVERITY_SET = new Set<SignalSeverity>(["low", "med", "high"]);

function assertSignalPayload(payload: Signal): Required<Pick<Signal, "project_id" | "kind">> & Signal {
  if (!payload || typeof payload !== "object") {
    throw new MemoryError("Invalid payload", 400);
  }
  const projectId = String(payload.project_id || "").trim();
  if (!projectId) {
    throw new MemoryError("project_id is required", 400);
  }
  const kind = payload.kind;
  if (!KIND_SET.has(kind as SignalKind)) {
    throw new MemoryError("Unsupported signal kind", 400, { kind });
  }
  if (payload.severity && !SEVERITY_SET.has(payload.severity)) {
    throw new MemoryError("Unsupported severity", 400, { severity: payload.severity });
  }

  const ts = payload.event_ts ? new Date(payload.event_ts) : new Date();
  if (Number.isNaN(ts.getTime())) {
    throw new MemoryError("event_ts must be ISO-8601", 400, { event_ts: payload.event_ts });
  }

  return {
    ...payload,
    project_id: projectId,
    kind: kind as SignalKind,
    event_ts: ts.toISOString(),
  };
}

export async function recordSignal(signal: Signal): Promise<void> {
  const payload = assertSignalPayload(signal);
  await ensureTable(
    "signals",
    "Memory signals table unavailable. Deploy the memory schema before sending signals."
  );

  const owner = clampText(payload.owner, 120);
  const featuresJson = payload.features ? JSON.stringify(payload.features) : null;
  const outcomeJson = payload.outcome ? JSON.stringify(payload.outcome) : null;

  const featuresExpr = featuresJson ? sql`cast(${featuresJson} as jsonb)` : sql`null`;
  const outcomeExpr = outcomeJson ? sql`cast(${outcomeJson} as jsonb)` : sql`null`;

  try {
    await db.execute(
      sql`insert into signals (project_id, kind, severity, owner, event_ts, features, outcome)
          values (${payload.project_id}, ${payload.kind}, ${payload.severity || null}, ${owner}, ${payload.event_ts}, ${featuresExpr}, ${outcomeExpr})`
    );
  } catch (error: any) {
    throw new MemoryError("Failed to persist signal", 500, error);
  }
}
