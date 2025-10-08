import { embedText } from "../embed";
import { redact, type RedactionPolicy } from "../redact";
import { normalizeAndChunk, estimateTokens, type IngestItem, type IngestStats } from "./base";
import { upsertMemory } from "../upsert";

interface DocsPayload {
  text?: string;
  markdown?: string;
  html?: string;
  meta?: Record<string, any>;
}

interface DocsIngestParams {
  project_id: string;
  payload: DocsPayload | string;
  policy: RedactionPolicy;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function resolveText(payload: DocsPayload | string): { text: string; meta: Record<string, any> } {
  if (typeof payload === "string") {
    return { text: payload, meta: {} };
  }

  const text = payload.text ?? payload.markdown ?? payload.html ?? "";
  const clean = payload.html ? stripHtml(text) : text;
  const meta = payload.meta ?? {};

  return { text: clean, meta };
}

export async function ingestDocs(params: DocsIngestParams): Promise<IngestStats> {
  const { project_id, payload, policy } = params;
  const { text, meta } = resolveText(payload);
  const trimmed = text.trim();
  if (!trimmed) {
    return { inserted: 0, chunkCount: 0, tokenCount: 0, piiTagsSummary: {}, warnings: ["empty-payload"] };
  }

  const { clean, tags } = redact(trimmed, policy);
  const sourceId = typeof meta.source_id === "string" ? meta.source_id : undefined;
  const item: IngestItem = {
    project_id,
    source_type: "docs",
    source_id: sourceId,
    text: clean,
    meta,
  };

  const { chunks } = normalizeAndChunk(item);
  if (!chunks.length) {
    return { inserted: 0, chunkCount: 0, tokenCount: 0, piiTagsSummary: {}, warnings: ["no-chunks"] };
  }

  const embeddings = await embedText(chunks.map(chunk => chunk.text));
  const upsertItems = chunks.map((chunk, idx) => ({
    text: chunk.text,
    embedding: embeddings[idx] ?? [],
    pii_tags: tags,
    lineage: {
      ...chunk.meta,
      source_id: sourceId,
    },
  }));

  const inserted = await upsertMemory(project_id, "docs", upsertItems);
  const tokenCount = chunks.reduce((acc, chunk) => acc + estimateTokens(chunk.text), 0);

  const summary: Record<string, number> = {};
  for (const tag of tags) {
    summary[tag] = (summary[tag] ?? 0) + 1;
  }

  return {
    inserted,
    chunkCount: chunks.length,
    tokenCount,
    piiTagsSummary: summary,
    warnings: [],
  };
}
