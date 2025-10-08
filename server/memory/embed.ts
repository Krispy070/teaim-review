import OpenAI from "openai";

const MAX_TOKENS_PER_BATCH = 1000;
const DEFAULT_MODEL = "text-embedding-3-large";
const TARGET_DIMENSIONS = 1536;

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY missing");
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey });
  }
  return cachedClient;
}

async function embedBatch(inputs: string[], attempt = 1): Promise<number[][]> {
  const client = getClient();
  const model = process.env.MEMORY_EMBED_MODEL || DEFAULT_MODEL;

  try {
    const response = await client.embeddings.create({
      model,
      input: inputs,
    });

    return response.data.map(item => {
      const vector = item.embedding.slice(0, TARGET_DIMENSIONS);
      if (vector.length < TARGET_DIMENSIONS) {
        return vector.concat(new Array(TARGET_DIMENSIONS - vector.length).fill(0));
      }
      return vector;
    });
  } catch (error: any) {
    if (attempt >= 4) {
      throw error;
    }
    const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
    await new Promise(resolve => setTimeout(resolve, delay));
    return embedBatch(inputs, attempt + 1);
  }
}

export async function embedText(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];

  const batches: string[][] = [];
  let current: string[] = [];
  let tokens = 0;

  for (const text of texts) {
    const chunkTokens = estimateTokens(text);
    if (current.length && tokens + chunkTokens > MAX_TOKENS_PER_BATCH) {
      batches.push(current);
      current = [];
      tokens = 0;
    }

    current.push(text);
    tokens += chunkTokens;
  }

  if (current.length) {
    batches.push(current);
  }

  const embeddings: number[][] = [];
  for (const batch of batches) {
    const result = await embedBatch(batch);
    embeddings.push(...result);
  }

  return embeddings;
}
