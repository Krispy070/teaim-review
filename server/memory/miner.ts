import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { clampText, MemoryError, parseJsonField, tableColumns, tableExists } from "./common";

const SEVERITY_WEIGHT: Record<string, number> = {
  high: 3,
  med: 2,
  medium: 2,
  low: 1,
};

const SEVERITY_CONFIDENCE: Record<number, number> = {
  3: 0.82,
  2: 0.68,
  1: 0.55,
  0: 0.5,
};

type MinerSignal = {
  projectId: string;
  kind: string;
  severity: string | null;
  vertical: string | null;
  phase: string | null;
  eventTs: string;
  features?: Record<string, any>;
  outcome?: Record<string, any>;
};

type MemoryItem = {
  id: string;
  projectId: string;
  vertical: string | null;
  phase: string | null;
  sourceType: string | null;
  lineage?: any;
  score?: number;
  updatedAt?: string;
};

type LessonDraft = {
  recommendation: string;
  confidence: number;
  support: { id: string; source_type: string }[];
  phase: string | null;
  vertical: string | null;
  lineage: any;
};

type RunMinerOptions = {
  project_id?: string;
  days?: number;
};

function maxSeverity(signals: MinerSignal[], kind: string): number {
  let max = 0;
  for (const signal of signals) {
    if (signal.kind !== kind) continue;
    const weight = SEVERITY_WEIGHT[signal.severity || ""] ?? 0;
    if (weight > max) max = weight;
  }
  return max;
}

function pickPhase(candidates: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let top: string | null = null;
  let best = 0;
  for (const [phase, n] of counts.entries()) {
    if (n > best) {
      best = n;
      top = phase;
    }
  }
  return top;
}

function summariseSignals(signals: MinerSignal[]): any {
  return signals.map((s) => ({
    kind: s.kind,
    severity: s.severity,
    phase: s.phase,
    event_ts: s.eventTs,
    vertical: s.vertical,
  }));
}

function deriveVertical(signal?: MinerSignal, item?: MemoryItem): string {
  const candidates = [
    signal?.vertical,
    signal?.features?.vertical,
    signal?.features?.domain,
    item?.vertical,
    item?.lineage?.vertical,
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  return (candidates[0] || "general").toLowerCase();
}

function derivePhaseFromSignal(signal: MinerSignal): string | null {
  const candidates = [
    signal.phase,
    signal.features?.phase,
    signal.features?.stage,
    signal.features?.milestone,
    signal.outcome?.phase,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function derivePhaseFromItem(item: MemoryItem): string | null {
  const candidates = [item.phase, item.lineage?.phase, item.lineage?.stage];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function buildLessons(
  projectId: string,
  vertical: string,
  signals: MinerSignal[],
  memoryItems: MemoryItem[]
): LessonDraft[] {
  if (!signals.length) return [];
  const lessons: LessonDraft[] = [];
  const phase = pickPhase([
    ...signals.map(derivePhaseFromSignal),
    ...memoryItems.map(derivePhaseFromItem),
  ]);

  const counts: Record<string, number> = Object.create(null);
  for (const signal of signals) {
    counts[signal.kind] = (counts[signal.kind] || 0) + 1;
  }

  const supportItems = memoryItems
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);
  const support = supportItems.map((item) => ({
    id: String(item.id),
    source_type: item.sourceType || "memory_item",
  }));

  const severityDelay = maxSeverity(signals, "delay");
  const severityDependency = maxSeverity(signals, "dependency");
  const severityApproval = maxSeverity(signals, "approval_latency");
  const severityDefect = maxSeverity(signals, "defect_escape");
  const severityScope = maxSeverity(signals, "scope_change");

  if (counts.delay) {
    const base = SEVERITY_CONFIDENCE[severityDelay] ?? 0.58;
    lessons.push({
      recommendation:
        "Re-baseline the plan with buffer on the critical path and publish daily burndown to absorb the delay.",
      confidence: Math.min(1, base + support.length * 0.03),
      support,
      phase,
      vertical,
      lineage: { projectId, vertical, phase, signals: summariseSignals(signals) },
    });
  }

  if (counts.dependency) {
    const base = SEVERITY_CONFIDENCE[severityDependency] ?? 0.55;
    lessons.push({
      recommendation:
        "Stand up a dependency huddle with the owning teams and commit unblock dates with executive visibility.",
      confidence: Math.min(1, base + support.length * 0.03),
      support,
      phase,
      vertical,
      lineage: { projectId, vertical, phase, signals: summariseSignals(signals) },
    });
  }

  if (counts.approval_latency) {
    const base = SEVERITY_CONFIDENCE[severityApproval] ?? 0.57;
    lessons.push({
      recommendation:
        "Pre-book approvers and move to parallel sign-offs with clear SLA dashboards to kill approval latency.",
      confidence: Math.min(1, base + support.length * 0.03),
      support,
      phase,
      vertical,
      lineage: { projectId, vertical, phase, signals: summariseSignals(signals) },
    });
  }

  if (counts.defect_escape) {
    const base = SEVERITY_CONFIDENCE[severityDefect] ?? 0.6;
    lessons.push({
      recommendation:
        "Add targeted regression suites and gate downstream migrations until exit criteria are re-established.",
      confidence: Math.min(1, base + support.length * 0.03),
      support,
      phase,
      vertical,
      lineage: { projectId, vertical, phase, signals: summariseSignals(signals) },
    });
  }

  if (counts.scope_change) {
    const base = SEVERITY_CONFIDENCE[severityScope] ?? 0.56;
    lessons.push({
      recommendation:
        "Spin up a scope-control log, get finance sign-off, and communicate the change window before more churn lands.",
      confidence: Math.min(1, base + support.length * 0.03),
      support,
      phase,
      vertical,
      lineage: { projectId, vertical, phase, signals: summariseSignals(signals) },
    });
  }

  if (
    severityDelay >= 2 &&
    (counts.dependency || counts.approval_latency)
  ) {
    const comboConfidence = Math.min(
      1,
      (SEVERITY_CONFIDENCE[severityDelay] ?? 0.6) + 0.08
    );
    lessons.push({
      recommendation:
        "Run a daily go-live control tower linking approvals, dependencies, and timeline so slippage is contained immediately.",
      confidence: Math.min(1, comboConfidence + support.length * 0.02),
      support,
      phase,
      vertical,
      lineage: { projectId, vertical, phase, signals: summariseSignals(signals) },
    });
  }

  // Ensure at least two lessons per vertical by falling back to memory observations
  if (lessons.length < 2 && supportItems.length) {
    const fallback = supportItems[0];
    lessons.push({
      recommendation: `Reinforce ${vertical} playbook guidance captured in ${clampText(
        fallback.sourceType || "recent memory",
        60
      )} to prevent repeat issues.`,
      confidence: Math.min(1, 0.52 + support.length * 0.04),
      support,
      phase,
      vertical,
      lineage: { projectId, vertical, phase, signals: summariseSignals(signals) },
    });
  }

  return lessons.slice(0, 5);
}

async function upsertLessons(
  lessons: LessonDraft[],
  columns: Set<string>
): Promise<number> {
  if (!lessons.length) return 0;

  const hasFingerprint = columns.has("fingerprint");
  const hasId = columns.has("id");
  const hasSource = columns.has("source");
  const hasPhase = columns.has("phase");
  const hasVertical = columns.has("vertical");
  const hasLineage = columns.has("lineage");
  const hasUpdatedAt = columns.has("updated_at");

  let updated = 0;
  for (const lesson of lessons) {
    const projectRef = lesson.lineage?.projectId;
    if (!projectRef) {
      continue;
    }
    const fingerprint = createHash("sha1")
      .update(`${lesson.vertical}|${lesson.phase}|${lesson.recommendation}`)
      .digest("hex");

    const supportJson = sql`cast(${JSON.stringify(lesson.support)} as jsonb)`;
    const lineagePayload = hasLineage
      ? sql`cast(${JSON.stringify(lesson.lineage)} as jsonb)`
      : null;

    let existingId: string | null = null;
    if (hasFingerprint) {
      const { rows } = await db.execute(
        sql`select ${hasId ? sql`id` : sql`fingerprint`} from lessons_learned where fingerprint=${fingerprint} limit 1`
      );
      if (rows?.length) {
        existingId = hasId ? String(rows[0].id) : fingerprint;
      }
    }

    const confidenceValue = Number(lesson.confidence.toFixed(3));
    const updateAssignments = [sql`confidence=${confidenceValue}`, sql`support=${supportJson}`];
    if (hasPhase) updateAssignments.push(sql`phase=${lesson.phase}`);
    if (hasVertical) updateAssignments.push(sql`vertical=${lesson.vertical}`);
    if (hasSource) updateAssignments.push(sql`source=${"miner"}`);
    if (hasLineage && lineagePayload) updateAssignments.push(sql`lineage=${lineagePayload}`);
    if (hasUpdatedAt) updateAssignments.push(sql`updated_at=now()`);

    if (existingId) {
      const whereClause = hasId
        ? sql`id=${existingId}`
        : sql`fingerprint=${fingerprint}`;
      await db.execute(
        sql`update lessons_learned set ${sql.join(updateAssignments, sql`, `)} where ${whereClause}`
      );
      updated += 1;
      continue;
    }

    const insertColumns = [sql`project_id`, sql`recommendation`, sql`confidence`, sql`support`];
    const insertValues = [
      sql`${projectRef}`,
      sql`${lesson.recommendation}`,
      sql`${confidenceValue}`,
      supportJson,
    ];
    if (hasPhase) {
      insertColumns.push(sql`phase`);
      insertValues.push(sql`${lesson.phase}`);
    }
    if (hasVertical) {
      insertColumns.push(sql`vertical`);
      insertValues.push(sql`${lesson.vertical}`);
    }
    if (hasSource) {
      insertColumns.push(sql`source`);
      insertValues.push(sql`${"miner"}`);
    }
    if (hasFingerprint) {
      insertColumns.push(sql`fingerprint`);
      insertValues.push(sql`${fingerprint}`);
    }
    if (hasLineage && lineagePayload) {
      insertColumns.push(sql`lineage`);
      insertValues.push(lineagePayload);
    }
    if (hasUpdatedAt) {
      insertColumns.push(sql`updated_at`);
      insertValues.push(sql`now()`);
    }

    await db.execute(
      sql`insert into lessons_learned (${sql.join(insertColumns, sql`, `)}) values (${sql.join(insertValues, sql`, `)})`
    );
    updated += 1;
  }

  return updated;
}

export async function runMiner(options: RunMinerOptions = {}): Promise<{ updated: number }> {
  const [hasSignals, hasMemory, hasLessons] = await Promise.all([
    tableExists("signals"),
    tableExists("memory_items"),
    tableExists("lessons_learned"),
  ]);

  if (!hasSignals || !hasMemory || !hasLessons) {
    return { updated: 0 };
  }

  const projectFilter = options.project_id?.trim();
  const lookback = Math.max(1, Math.min(options.days ?? 30, 365));

  const signalColumns = await tableColumns("signals");
  const hasSignalVertical = signalColumns.has("vertical");
  const hasSignalFeatures = signalColumns.has("features");
  const hasSignalOutcome = signalColumns.has("outcome");

  const conditions = [sql`event_ts >= now() - ${`${lookback} days`}::interval`];
  if (projectFilter) conditions.push(sql`project_id = ${projectFilter}`);
  const whereSql = sql.join(conditions, sql` and `);

  const selectSignalColumns = [
    sql`project_id`,
    sql`kind`,
    sql`severity`,
    sql`event_ts`,
    hasSignalFeatures ? sql`features` : sql`null as features`,
    hasSignalOutcome ? sql`outcome` : sql`null as outcome`,
  ];
  if (hasSignalVertical) selectSignalColumns.push(sql`vertical`);
  if (signalColumns.has("phase")) selectSignalColumns.push(sql`phase`);

  const { rows: rawSignals } = await db.execute(
    sql`select ${sql.join(selectSignalColumns, sql`, `)} from signals where ${whereSql} order by event_ts desc`
  );

  const signals: MinerSignal[] = (rawSignals || []).map((row: any) => {
    const features = hasSignalFeatures ? parseJsonField<Record<string, any>>(row.features) : undefined;
    const outcome = hasSignalOutcome ? parseJsonField<Record<string, any>>(row.outcome) : undefined;
    const phaseValue = typeof row.phase === "string" ? row.phase : features?.phase;
    return {
      projectId: String(row.project_id),
      kind: String(row.kind),
      severity: row.severity ? String(row.severity) : null,
      vertical: hasSignalVertical && row.vertical ? String(row.vertical) : features?.vertical || null,
      phase: phaseValue ? String(phaseValue) : null,
      eventTs: String(row.event_ts),
      features,
      outcome,
    } satisfies MinerSignal;
  });

  if (!signals.length) {
    return { updated: 0 };
  }

  const projectIds = Array.from(new Set(signals.map((s) => s.projectId)));
  const memoryColumns = await tableColumns("memory_items");
  const hasMemoryVertical = memoryColumns.has("vertical");
  const hasMemoryPhase = memoryColumns.has("phase");
  const hasMemorySource = memoryColumns.has("source_type");
  const hasMemoryLineage = memoryColumns.has("lineage");
  const hasMemoryScore = memoryColumns.has("score");
  const hasMemoryUpdatedAt = memoryColumns.has("updated_at");

  const memorySelect = [
    sql`id`,
    sql`project_id`,
    hasMemoryVertical ? sql`vertical` : sql`null as vertical`,
    hasMemoryPhase ? sql`phase` : sql`null as phase`,
    hasMemorySource ? sql`source_type` : sql`null as source_type`,
  ];
  if (hasMemoryLineage) memorySelect.push(sql`lineage`);
  if (hasMemoryScore) memorySelect.push(sql`score`);
  if (hasMemoryUpdatedAt) memorySelect.push(sql`updated_at`);

  const memoryQuery = sql`
    select ${sql.join(memorySelect, sql`, `)}
      from memory_items
     where project_id in (${sql.join(projectIds.map((id) => sql`${id}`), sql`, `)})
  `;

  const { rows: rawMemory } = await db.execute(memoryQuery);
  const memoryByProject = new Map<string, MemoryItem[]>();
  for (const row of rawMemory || []) {
    const lineage = hasMemoryLineage ? parseJsonField<any>(row.lineage) : undefined;
    const projectId = String(row.project_id);
    const item: MemoryItem = {
      id: String(row.id),
      projectId,
      vertical: hasMemoryVertical && row.vertical ? String(row.vertical) : lineage?.vertical || null,
      phase: hasMemoryPhase && row.phase ? String(row.phase) : lineage?.phase || null,
      sourceType: hasMemorySource && row.source_type ? String(row.source_type) : null,
      lineage,
      score: hasMemoryScore && row.score != null ? Number(row.score) : undefined,
      updatedAt: hasMemoryUpdatedAt && row.updated_at ? String(row.updated_at) : undefined,
    };
    if (!memoryByProject.has(projectId)) memoryByProject.set(projectId, []);
    memoryByProject.get(projectId)!.push(item);
  }

  let updated = 0;
  const lessonsColumns = await tableColumns("lessons_learned");

  for (const projectId of projectIds) {
    const projectSignals = signals.filter((s) => s.projectId === projectId);
    const projectMemory = memoryByProject.get(projectId) || [];

    const grouped = new Map<string, { signals: MinerSignal[]; items: MemoryItem[] }>();
    for (const signal of projectSignals) {
      const vertical = deriveVertical(signal);
      if (!grouped.has(vertical)) grouped.set(vertical, { signals: [], items: [] });
      grouped.get(vertical)!.signals.push(signal);
    }

    for (const item of projectMemory) {
      const vertical = deriveVertical(undefined, item);
      if (!grouped.has(vertical)) grouped.set(vertical, { signals: [], items: [] });
      grouped.get(vertical)!.items.push(item);
    }

    for (const [vertical, bundle] of grouped.entries()) {
      if (!bundle.signals.length) continue;
      const lessons = buildLessons(projectId, vertical, bundle.signals, bundle.items);
      if (!lessons.length) continue;
      for (const lesson of lessons) {
        // include project id within lineage for persistence
        lesson.lineage.projectId = projectId;
      }
      updated += await upsertLessons(lessons, lessonsColumns);
    }
  }

  return { updated };
}

function parseCliArgs(argv: string[]): RunMinerOptions {
  const opts: RunMinerOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project" || arg === "--project_id") {
      opts.project_id = argv[i + 1];
      i += 1;
    } else if (arg === "--days") {
      const n = Number(argv[i + 1]);
      if (!Number.isNaN(n)) opts.days = n;
      i += 1;
    }
  }
  return opts;
}

const isMain = (() => {
  try {
    const current = fileURLToPath(import.meta.url);
    const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
    return current === entry;
  } catch {
    return false;
  }
})();

if (isMain) {
  runMiner(parseCliArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(`memory miner updated ${result.updated} lesson(s)`);
      process.exit(0);
    })
    .catch((error) => {
      if (error instanceof MemoryError) {
        console.error(`memory miner failed: ${error.message}`);
      } else {
        console.error("memory miner crashed", error);
      }
      process.exit(1);
    });
}
