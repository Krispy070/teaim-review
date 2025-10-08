import { embedText } from "../embed";
import { redact, type RedactionPolicy } from "../redact";
import { normalizeAndChunk, estimateTokens, type IngestItem, type IngestStats } from "./base";
import { upsertMemory } from "../upsert";

interface CsvRow {
  [key: string]: string | undefined;
}

interface CsvPayload {
  csv?: string;
  rows?: CsvRow[];
  file?: string;
  policy?: RedactionPolicy;
}

interface CsvIngestParams {
  project_id: string;
  payload: CsvPayload | string;
  policy: RedactionPolicy;
}

function parseCsv(csv: string): CsvRow[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const row: CsvRow = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() ?? "";
    });
    rows.push(row);
  }

  return rows;
}

function resolveRows(payload: CsvPayload | string): { rows: CsvRow[]; file?: string } {
  if (typeof payload === "string") {
    return { rows: parseCsv(payload) };
  }

  if (payload.rows && Array.isArray(payload.rows)) {
    return { rows: payload.rows, file: payload.file };
  }

  if (payload.csv) {
    return { rows: parseCsv(payload.csv), file: payload.file };
  }

  return { rows: [], file: payload.file };
}

function buildText(row: CsvRow): string {
  const pieces: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (!value) continue;
    pieces.push(`${key}: ${value}`);
  }
  return pieces.join("\n");
}

export async function ingestCsvRelease(params: CsvIngestParams): Promise<IngestStats> {
  const { project_id, payload, policy } = params;
  const { rows, file } = resolveRows(payload);

  const chunks: { text: string; meta: Record<string, any>; pii_tags: string[] }[] = [];
  const summary: Record<string, number> = {};

  rows.forEach((row, index) => {
    const text = buildText(row).trim();
    if (!text) return;

    const { clean, tags } = redact(text, policy);
    const ingestItem: IngestItem = {
      project_id,
      source_type: "csv_release",
      source_id: `${file ?? "csv"}:${index}`,
      text: clean,
      meta: {
        row: index,
        file,
        raw: row,
      },
    };

    const { chunks: normalized } = normalizeAndChunk(ingestItem);
    for (const chunk of normalized) {
      chunks.push({
        text: chunk.text,
        meta: { ...chunk.meta, row: index, file },
        pii_tags: tags,
      });
    }

    for (const tag of tags) {
      summary[tag] = (summary[tag] ?? 0) + 1;
    }
  });

  if (!chunks.length) {
    return { inserted: 0, chunkCount: 0, tokenCount: 0, piiTagsSummary: summary, warnings: ["no-rows"] };
  }

  const embeddings = await embedText(chunks.map(chunk => chunk.text));
  const upsertItems = chunks.map((chunk, idx) => ({
    text: chunk.text,
    embedding: embeddings[idx] ?? [],
    pii_tags: chunk.pii_tags,
    lineage: {
      ...chunk.meta,
      type: "csv_release",
    },
  }));

  const inserted = await upsertMemory(project_id, "csv_release", upsertItems);
  const tokenCount = chunks.reduce((acc, chunk) => acc + estimateTokens(chunk.text), 0);

  return {
    inserted,
    chunkCount: chunks.length,
    tokenCount,
    piiTagsSummary: summary,
    warnings: [],
  };
}
