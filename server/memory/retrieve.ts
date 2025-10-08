import { performance } from "node:perf_hooks";
import OpenAI from "openai";
import { pool } from "../db/client";
import { cosineSimilarity } from "../lib/embed";
import { annVectorQuery } from "./sql";

export type DeliveryPhase =
  | "Discovery"
  | "Design"
  | "Build"
  | "Test"
  | "UAT"
  | "Release"
  | "Hypercare";

export type RetrieveInput = {
  project_id: string;
  query: string;
  k?: number;
  phase?: DeliveryPhase;
  filters?: {
    source_type?: string[];
    since_days?: number;
  };
};

export interface RetrieveContext {
  id: string;
  text: string;
  source_type: string;
  lineage: any;
  score: number;
}

export interface RetrieveDebug {
  mode: "hybrid";
  k: number;
  weights: {
    semantic: number;
    recency: number;
    sourceType: number;
    phase: number;
  };
  raw?: any;
}

export class MemoryServiceError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

interface CandidateRow {
  id: string;
  text: string;
  source_type: string;
  lineage: any;
  created_at: string | Date;
  embedding: number[] | string | null;
}

interface ScoredCandidate extends RetrieveContext {
  breakdown: {
    semantic: number;
    recency: number;
    sourceType: number;
    phase: number;
  };
}

const SOURCE_PRIORS: Record<string, number> = {
  docs: 1.0,
  meetings: 0.95,
  slack: 0.9,
  csv_release: 0.85
};

const DEFAULT_SOURCE_PRIOR = 0.8;
const SEMANTIC_WEIGHT = 0.45;
const RECENCY_WEIGHT = 0.25;
const SOURCE_TYPE_WEIGHT = 0.2;
const PHASE_WEIGHT = 0.1;

const HALF_LIFE_DAYS = 90;
const MAX_CANDIDATES = 200;
const DISABLED_FLAGS = new Set(["0", "false", "off"]);

let openaiClient: OpenAI | null = null;
let embedModelName: string | null = process.env.MEMORY_EMBED_MODEL ?? null;
let activePool = pool;

if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

let cachedTsvColumn: string | null | undefined;
const defaultOpenAIClient = openaiClient;
const defaultEmbedModel = embedModelName;

type QueryablePool = Pick<typeof pool, "query">;

export function __setMemoryTestOverrides(overrides: {
  pool?: QueryablePool;
  openai?: OpenAI | null;
  embedModel?: string | null;
}): void {
  if (overrides.pool) {
    activePool = overrides.pool;
    cachedTsvColumn = undefined;
  }
  if (overrides.openai !== undefined) {
    openaiClient = overrides.openai;
  }
  if (overrides.embedModel !== undefined) {
    embedModelName = overrides.embedModel;
  }
}

export function __resetMemoryTestOverrides(): void {
  activePool = pool;
  openaiClient = defaultOpenAIClient;
  embedModelName = defaultEmbedModel;
  cachedTsvColumn = undefined;
}

export function isMemoryEnabled(): boolean {
  const flag = process.env.MEMORY_ENABLED;
  if (!flag) return false;
  return !DISABLED_FLAGS.has(flag.toLowerCase());
}

const PHASE_KEYWORDS: Record<DeliveryPhase, string[]> = {
  Discovery: ["discovery", "research", "interview", "insight"],
  Design: ["design", "wireframe", "prototype", "ux"],
  Build: ["build", "implementation", "dev", "develop", "coding"],
  Test: ["test", "qa", "verification", "bug"],
  UAT: ["uat", "user acceptance", "acceptance", "sign off"],
  Release: ["release", "launch", "deploy", "release notes"],
  Hypercare: ["hypercare", "stabilization", "post-launch", "hotfix"]
};

function requireEmbedding(): OpenAI {
  if (!openaiClient || !embedModelName) {
    throw new MemoryServiceError(503, "embedding disabled");
  }
  return openaiClient;
}

function normalizeEmbedding(raw: number[] | string | null): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw.map((val) => Number(val));
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim().replace(/[\[\]{}]/g, "");
    if (!trimmed) return [];
    return trimmed.split(",").map((v) => Number(v));
  }
  return null;
}

function normalizeCosine(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, (value + 1) / 2));
}

function computeRecency(createdAt: string | Date, nowMs: number): number {
  const created = createdAt instanceof Date ? createdAt.getTime() : Date.parse(String(createdAt));
  if (!Number.isFinite(created)) {
    return 0.5;
  }
  const ageDays = (nowMs - created) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  const score = Math.exp(-ageDays / HALF_LIFE_DAYS);
  return Math.min(1, Math.max(0, score));
}

function computeSourcePrior(sourceType: string): number {
  return SOURCE_PRIORS[sourceType] ?? DEFAULT_SOURCE_PRIOR;
}

function safeLineage(lineage: any): any {
  if (!lineage) return null;
  if (typeof lineage === "object") return lineage;
  if (typeof lineage === "string") {
    try {
      return JSON.parse(lineage);
    } catch {
      return lineage;
    }
  }
  return lineage;
}

function computePhaseHint(phase: DeliveryPhase | undefined, candidate: CandidateRow): number {
  if (!phase) return 0;

  const keywords = PHASE_KEYWORDS[phase];
  const lineage = safeLineage(candidate.lineage);

  const parts: string[] = [];
  if (candidate.text) parts.push(candidate.text);
  if (lineage) {
    if (typeof lineage === "string") {
      parts.push(lineage);
    } else {
      parts.push(JSON.stringify(lineage));
      if (typeof (lineage as any).phase === "string") {
        parts.push(String((lineage as any).phase));
      }
      if (typeof (lineage as any).title === "string") {
        parts.push(String((lineage as any).title));
      }
      if (Array.isArray((lineage as any).tags)) {
        parts.push(((lineage as any).tags as string[]).join(" "));
      }
    }
  }

  const haystack = parts.join(" ").toLowerCase();
  const matchedKeyword = keywords.some((kw) => haystack.includes(kw));

  let score = matchedKeyword ? 1 : 0;

  if (!matchedKeyword) {
    if (phase === "Release" || phase === "UAT") {
      if (candidate.source_type === "csv_release") score = 0.9;
    }
    if (phase === "Design" && candidate.source_type === "docs") score = Math.max(score, 0.6);
    if (phase === "Discovery" && candidate.source_type === "meetings") score = Math.max(score, 0.6);
  }

  return Math.min(1, Math.max(0, score));
}

async function lookupTsvColumn(): Promise<string | null> {
  if (cachedTsvColumn !== undefined) {
    return cachedTsvColumn;
  }
  try {
    const result = await activePool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'memory_items' AND udt_name = 'tsvector' LIMIT 1"
    );
    const column = result.rows?.[0]?.column_name;
    cachedTsvColumn = typeof column === "string" ? column : null;
  } catch (error) {
    cachedTsvColumn = null;
  }
  return cachedTsvColumn;
}

async function lexicalPrefilter(projectId: string, query: string): Promise<string[]> {
  const column = await lookupTsvColumn();
  if (!column) return [];

  const safeColumn = column.replace(/[^a-zA-Z0-9_]/g, "");
  if (!safeColumn) return [];

  try {
    const result = await activePool.query(
      `SELECT id FROM memory_items WHERE project_id = $1 AND ${safeColumn} @@ plainto_tsquery('english', $2) ORDER BY created_at DESC LIMIT $3`,
      [projectId, query, MAX_CANDIDATES]
    );
    return (result.rows || []).map((row: any) => row.id).filter(Boolean);
  } catch (error) {
    return [];
  }
}

async function fetchCandidatesByIds(projectId: string, ids: string[]): Promise<CandidateRow[]> {
  if (ids.length === 0) return [];
  try {
    const result = await activePool.query(
      "SELECT id, text, source_type, lineage, created_at, embedding FROM memory_items WHERE project_id = $1 AND id = ANY($2) AND embedding IS NOT NULL LIMIT $3",
      [projectId, ids, MAX_CANDIDATES]
    );
    return result.rows as CandidateRow[];
  } catch (error) {
    throw normalizePgError(error);
  }
}

async function fetchAnnCandidates(projectId: string, queryVector: number[]): Promise<CandidateRow[]> {
  const annQuery = annVectorQuery(projectId, queryVector, MAX_CANDIDATES);
  try {
    const result = await activePool.query(annQuery.text, annQuery.values);
    return result.rows as CandidateRow[];
  } catch (error) {
    throw normalizePgError(error);
  }
}

function normalizePgError(error: any): MemoryServiceError {
  const code = error?.code;
  const message = typeof error?.message === "string" ? error.message : "unknown database error";
  if (code === "42P01") {
    return new MemoryServiceError(503, "memory storage not provisioned", message);
  }
  if (code === "42883" || code === "42704" || message.includes("vector")) {
    return new MemoryServiceError(503, "vector search not available", message);
  }
  return new MemoryServiceError(500, "memory retrieval failed", message);
}

function applyFilters(rows: CandidateRow[], input: RetrieveInput): CandidateRow[] {
  const sinceDate = input.filters?.since_days
    ? new Date(Date.now() - input.filters.since_days * 24 * 60 * 60 * 1000)
    : null;

  const sourceTypes = Array.isArray(input.filters?.source_type)
    ? input.filters!.source_type!.filter((value) => typeof value === "string" && value.trim() !== "")
    : null;

  return rows.filter((row) => {
    if (sinceDate) {
      const created = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
      if (created < sinceDate) return false;
    }
    if (sourceTypes && sourceTypes.length > 0) {
      if (!sourceTypes.includes(row.source_type)) return false;
    }
    return true;
  });
}

export async function retrieve(input: RetrieveInput): Promise<{ contexts: RetrieveContext[]; debug: RetrieveDebug }> {
  if (!isMemoryEnabled()) {
    throw new MemoryServiceError(503, "memory disabled");
  }
  if (!input.project_id || !input.project_id.trim()) {
    throw new MemoryServiceError(400, "project_id required");
  }
  if (!input.query || !input.query.trim()) {
    throw new MemoryServiceError(400, "query required");
  }

  const started = performance.now();
  const k = Number.isFinite(input.k) && input.k! > 0 ? Math.min(Math.floor(input.k!), 50) : 8;

  const embedClient = requireEmbedding();
  let queryVector: number[];
  try {
    const response = await embedClient.embeddings.create({
      model: embedModelName!,
      input: input.query,
    });
    queryVector = response.data?.[0]?.embedding ?? [];
  } catch (error) {
    throw new MemoryServiceError(503, "embedding provider unavailable", error);
  }

  if (!Array.isArray(queryVector) || queryVector.length === 0) {
    throw new MemoryServiceError(503, "embedding provider unavailable");
  }

  const lexicalIds = await lexicalPrefilter(input.project_id, input.query);
  let candidateRows: CandidateRow[];
  let lexicalUsed = false;

  if (lexicalIds.length > 0) {
    lexicalUsed = true;
    candidateRows = await fetchCandidatesByIds(input.project_id, lexicalIds);
  } else {
    candidateRows = await fetchAnnCandidates(input.project_id, queryVector);
  }

  const filteredRows = applyFilters(candidateRows, input);
  const nowMs = Date.now();

  const scored = filteredRows
    .map((row): ScoredCandidate | null => {
      const embedding = normalizeEmbedding(row.embedding);
      if (!embedding || embedding.length !== queryVector.length) {
        return null;
      }
      const semantic = normalizeCosine(cosineSimilarity(queryVector, embedding));
      const recency = computeRecency(row.created_at, nowMs);
      const sourceType = computeSourcePrior(row.source_type);
      const phase = computePhaseHint(input.phase, row);
      const score =
        semantic * SEMANTIC_WEIGHT +
        recency * RECENCY_WEIGHT +
        sourceType * SOURCE_TYPE_WEIGHT +
        phase * PHASE_WEIGHT;

      return {
        id: row.id,
        text: row.text,
        source_type: row.source_type,
        lineage: safeLineage(row.lineage),
        score,
        breakdown: { semantic, recency, sourceType, phase },
      };
    })
    .filter((value): value is ScoredCandidate => value !== null);

  const ordered = scored.sort((a, b) => b.score - a.score).slice(0, k);

  const debug: RetrieveDebug = {
    mode: "hybrid",
    k,
    weights: {
      semantic: SEMANTIC_WEIGHT,
      recency: RECENCY_WEIGHT,
      sourceType: SOURCE_TYPE_WEIGHT,
      phase: PHASE_WEIGHT,
    },
    raw: {
      lexicalUsed,
      candidateCount: candidateRows.length,
      filteredCount: filteredRows.length,
      scored: scored.map((row) => ({ id: row.id, ...row.breakdown, score: row.score })),
    },
  };

  const contexts: RetrieveContext[] = ordered.map((row) => ({
    id: row.id,
    text: row.text,
    source_type: row.source_type,
    lineage: row.lineage,
    score: row.score,
  }));

  const duration = performance.now() - started;
  try {
    console.log(
      `[memory] retrieve project=${input.project_id} candidates=${candidateRows.length} filtered=${filteredRows.length} returned=${contexts.length} duration=${duration.toFixed(1)}ms`
    );
  } catch {
    // no-op logging failures
  }

  return { contexts, debug };
}
