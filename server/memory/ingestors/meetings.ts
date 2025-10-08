import { embedText } from "../embed";
import { redact, type RedactionPolicy } from "../redact";
import { estimateTokens, normalizeAndChunk, type IngestItem, type IngestStats } from "./base";
import { upsertMemory } from "../upsert";

interface TranscriptSegment {
  ts?: string;
  speaker?: string;
  text: string;
  [key: string]: any;
}

interface MeetingsPayload {
  transcript?: TranscriptSegment[];
  segments?: TranscriptSegment[];
  entries?: TranscriptSegment[];
}

interface MeetingsIngestParams {
  project_id: string;
  payload: MeetingsPayload | TranscriptSegment[];
  policy: RedactionPolicy;
}

const MIN_WINDOW = 600;
const MAX_WINDOW = 900;

function coalesceSegments(payload: MeetingsPayload | TranscriptSegment[]): TranscriptSegment[] {
  if (Array.isArray(payload)) return payload;
  return payload.transcript ?? payload.segments ?? payload.entries ?? [];
}

function buildWindows(segments: TranscriptSegment[]): { text: string; span: { start?: string; end?: string }; speakers: Set<string> }[] {
  const windows: { text: string; span: { start?: string; end?: string }; speakers: Set<string> }[] = [];
  let buffer: TranscriptSegment[] = [];
  let tokens = 0;

  const flush = () => {
    if (!buffer.length) return;
    const lines = buffer.map(part => {
      const speaker = part.speaker ? `${part.speaker}: ` : "";
      return `${speaker}${part.text}`.trim();
    }).filter(Boolean);

    if (!lines.length) {
      buffer = [];
      tokens = 0;
      return;
    }

    const text = lines.join("\n");
    const speakers = new Set(buffer.map(part => part.speaker).filter(Boolean) as string[]);
    windows.push({
      text,
      span: {
        start: buffer[0]?.ts,
        end: buffer[buffer.length - 1]?.ts,
      },
      speakers,
    });
    buffer = [];
    tokens = 0;
  };

  for (const segment of segments) {
    if (!segment?.text?.trim()) continue;
    const segmentText = segment.text.trim();
    const tokenCount = estimateTokens(segmentText);
    if (buffer.length && tokens + tokenCount > MAX_WINDOW) {
      flush();
    }

    buffer.push(segment);
    tokens += tokenCount;

    if (tokens >= MIN_WINDOW) {
      flush();
    }
  }

  flush();
  return windows;
}

export async function ingestMeetings(params: MeetingsIngestParams): Promise<IngestStats> {
  const { project_id, payload, policy } = params;
  const segments = coalesceSegments(payload);

  const windows = buildWindows(segments);
  if (!windows.length) {
    return { inserted: 0, chunkCount: 0, tokenCount: 0, piiTagsSummary: {}, warnings: ["no-transcript"] };
  }

  const chunkRecords: { text: string; pii_tags: string[]; meta: Record<string, any> }[] = [];
  const summary: Record<string, number> = {};

  for (const window of windows) {
    const { clean, tags } = redact(window.text, policy);
    const ingestItem: IngestItem = {
      project_id,
      source_type: "meetings",
      text: clean,
      meta: {
        span: window.span,
        speakers: Array.from(window.speakers),
      },
    };

    const { chunks } = normalizeAndChunk(ingestItem);
    for (const chunk of chunks) {
      chunkRecords.push({
        text: chunk.text,
        pii_tags: tags,
        meta: {
          ...chunk.meta,
          span: window.span,
          speakers: Array.from(window.speakers),
        },
      });
    }

    for (const tag of tags) {
      summary[tag] = (summary[tag] ?? 0) + 1;
    }
  }

  const embeddings = await embedText(chunkRecords.map(chunk => chunk.text));
  const upsertItems = chunkRecords.map((chunk, idx) => ({
    text: chunk.text,
    embedding: embeddings[idx] ?? [],
    pii_tags: chunk.pii_tags,
    lineage: {
      ...chunk.meta,
      speaker: chunk.meta?.speakers?.length === 1 ? chunk.meta.speakers[0] : "multiple",
      span: chunk.meta.span,
    },
  }));

  const inserted = await upsertMemory(project_id, "meetings", upsertItems);
  const tokenCount = chunkRecords.reduce((acc, chunk) => acc + estimateTokens(chunk.text), 0);

  return {
    inserted,
    chunkCount: chunkRecords.length,
    tokenCount,
    piiTagsSummary: summary,
    warnings: [],
  };
}
