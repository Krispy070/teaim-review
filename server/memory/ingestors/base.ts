
export type IngestItem = {
  project_id: string;
  source_type: string;
  source_id?: string;
  text: string;
  meta?: Record<string, any> | null;
};

export interface NormalizedChunk {
  text: string;
  meta: Record<string, any>;
}

export interface IngestStats {
  inserted: number;
  chunkCount: number;
  tokenCount: number;
  piiTagsSummary: Record<string, number>;
  warnings: string[];
}

const SOFT_TOKEN_LIMIT = 800;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function splitLargeParagraph(paragraph: string): string[] {
  if (!paragraph) return [];
  if (estimateTokens(paragraph) <= SOFT_TOKEN_LIMIT) {
    return [paragraph];
  }

  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (estimateTokens(candidate) > SOFT_TOKEN_LIMIT && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

export function normalizeAndChunk(input: IngestItem): { chunks: { text: string; meta: any }[] } {
  const baseMeta = input.meta ?? {};
  const text = (input.text ?? "").replace(/\r\n?/g, "\n");
  const paragraphs = text.split(/\n{2,}/).map(part => part.trim()).filter(Boolean);

  const chunks: { text: string; meta: Record<string, any> }[] = [];
  let buffer: string[] = [];
  let bufferTokens = 0;

  const flush = () => {
    if (!buffer.length) return;
    const chunkText = buffer.join("\n\n").trim();
    if (!chunkText) {
      buffer = [];
      bufferTokens = 0;
      return;
    }
    chunks.push({
      text: chunkText,
      meta: {
        ...baseMeta,
        chunk_index: chunks.length,
      },
    });
    buffer = [];
    bufferTokens = 0;
  };

  for (const paragraph of paragraphs) {
    const parts = splitLargeParagraph(paragraph);
    for (const part of parts) {
      const tokens = estimateTokens(part);
      if (buffer.length && bufferTokens + tokens > SOFT_TOKEN_LIMIT) {
        flush();
      }
      buffer.push(part);
      bufferTokens += tokens;
      if (bufferTokens >= SOFT_TOKEN_LIMIT) {
        flush();
      }
    }
  }

  flush();

  if (!chunks.length && text.trim()) {
    chunks.push({
      text: text.trim(),
      meta: {
        ...baseMeta,
        chunk_index: 0,
      },
    });
  }

  return { chunks };
}
