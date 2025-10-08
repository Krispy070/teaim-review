import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { ensureTable, MemoryError, parseJsonField, tableColumns } from "./common";
import { phaseBoost } from "./phase";

export type RecommendationSupport = { id: string; source_type: string };

export type Recommendation = {
  recommendation: string;
  confidence: number;
  support: RecommendationSupport[];
  phase?: string | null;
  vertical?: string | null;
};

export async function recommendations(
  projectId: string,
  opts: { phase?: string; k?: number } = {}
): Promise<Recommendation[]> {
  const project_id = String(projectId || "").trim();
  if (!project_id) {
    throw new MemoryError("project_id is required", 400);
  }

  await ensureTable(
    "lessons_learned",
    "Lessons learned store unavailable. Run the miner after deploying the memory schema."
  );

  const limit = Math.max(1, Math.min(opts.k ?? 5, 20));
  const phase = opts.phase?.trim();

  const columns = await tableColumns("lessons_learned");
  const hasLineage = columns.has("lineage");
  const hasUpdatedAt = columns.has("updated_at");

  const selectColumns = [
    sql`project_id`,
    sql`recommendation`,
    sql`confidence`,
    sql`support`,
    columns.has("phase") ? sql`phase` : sql`null as phase`,
    columns.has("vertical") ? sql`vertical` : sql`null as vertical`,
  ];
  if (hasLineage) selectColumns.push(sql`lineage`);
  if (hasUpdatedAt) selectColumns.push(sql`updated_at`);

  let query = sql`
    select ${sql.join(selectColumns, sql`, `)}
      from lessons_learned
     where project_id = ${project_id}
  `;

  if (phase) {
    query = sql`${query} and (phase is null or phase = ${phase})`;
  }

  if (hasUpdatedAt) {
    query = sql`${query} order by updated_at desc nulls last`;
  }

  const { rows } = await db.execute(query);
  const items = (rows || []).map((row: any) => {
    const support = parseJsonField<RecommendationSupport[]>(row.support) || [];
    const lineage = hasLineage ? parseJsonField<any>(row.lineage) ?? undefined : undefined;
    const baseConfidence = typeof row.confidence === "number" ? row.confidence : Number(row.confidence || 0.5);
    const boost = phaseBoost(phase, lineage ?? row.phase);
    const score = Math.max(0, Math.min(1, baseConfidence * boost));
    return {
      recommendation: String(row.recommendation || ""),
      confidence: Number(score.toFixed(3)),
      support,
      phase: row.phase ?? null,
      vertical: row.vertical ?? null,
    } satisfies Recommendation;
  });

  items.sort((a, b) => b.confidence - a.confidence);
  return items.slice(0, limit);
}
