import { embedText } from "../embed";
import { redact, type RedactionPolicy } from "../redact";
import { normalizeAndChunk, estimateTokens, type IngestItem, type IngestStats } from "./base";
import { upsertMemory } from "../upsert";

interface SlackMessage {
  text?: string;
  user?: string;
  ts?: string;
  channel?: string;
  thread_ts?: string;
  [key: string]: any;
}

interface SlackPayload {
  messages?: SlackMessage[];
  channel?: string;
  file?: string;
}

interface SlackIngestParams {
  project_id: string;
  payload: SlackPayload | SlackMessage[];
  policy: RedactionPolicy;
}

export async function ingestSlack(params: SlackIngestParams): Promise<IngestStats> {
  const { project_id, payload, policy } = params;
  const messages = Array.isArray(payload) ? payload : payload.messages ?? [];
  const defaultChannel = Array.isArray(payload) ? undefined : payload.channel;
  const fileRef = Array.isArray(payload) ? undefined : payload.file;

  const chunks: { text: string; meta: Record<string, any>; pii_tags: string[] }[] = [];
  const piiCounts: Record<string, number> = {};

  for (const message of messages) {
    const text = (message.text ?? "").trim();
    if (!text) continue;

    const channel = message.channel || defaultChannel || "unknown";
    const ts = message.ts || message.thread_ts || "";
    const sourceId = ts ? `${channel}:${ts}` : channel;
    const { clean, tags } = redact(text, policy);

    const ingestItem: IngestItem = {
      project_id,
      source_type: "slack",
      source_id: sourceId,
      text: clean,
      meta: {
        channel,
        ts,
        user: message.user,
        file: fileRef,
      },
    };

    const { chunks: normalized } = normalizeAndChunk(ingestItem);
    for (const chunk of normalized) {
      chunks.push({
        text: chunk.text,
        meta: {
          ...chunk.meta,
          channel,
          ts,
          user: message.user,
          source_id: sourceId,
        },
        pii_tags: tags,
      });
    }

    for (const tag of tags) {
      piiCounts[tag] = (piiCounts[tag] ?? 0) + 1;
    }
  }

  if (!chunks.length) {
    return { inserted: 0, chunkCount: 0, tokenCount: 0, piiTagsSummary: piiCounts, warnings: ["no-messages"] };
  }

  const embeddings = await embedText(chunks.map(chunk => chunk.text));
  const upsertItems = chunks.map((chunk, idx) => ({
    text: chunk.text,
    embedding: embeddings[idx] ?? [],
    pii_tags: chunk.pii_tags,
    lineage: {
      ...chunk.meta,
      type: "slack", // keep explicit for debugging
    },
  }));

  const inserted = await upsertMemory(project_id, "slack", upsertItems);
  const tokenCount = chunks.reduce((acc, chunk) => acc + estimateTokens(chunk.text), 0);

  return {
    inserted,
    chunkCount: chunks.length,
    tokenCount,
    piiTagsSummary: piiCounts,
    warnings: [],
  };
}
