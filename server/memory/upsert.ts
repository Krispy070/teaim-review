import type { PoolClient } from "pg";
import { pool } from "../db/client";

export interface UpsertMemoryItem {
  text: string;
  embedding: number[];
  pii_tags?: string[];
  lineage?: Record<string, any> | null;
}

export function toVectorLiteral(embedding: number[]): string {
  if (!embedding.length) {
    return `[${new Array(1536).fill(0).join(",")}]`;
  }
  return `[${embedding.map(value => Number.isFinite(value) ? Number(value.toFixed(6)) : 0).join(",")}]`;
}

async function ensureIndex(client: PoolClient): Promise<void> {
  try {
    await client.query(
      "CREATE INDEX IF NOT EXISTS memory_items_embedding_ivfflat ON memory_items USING ivfflat (embedding vector_cosine_ops)"
    );
  } catch (error) {
    console.warn("memory_items index creation skipped", error instanceof Error ? error.message : error);
  }
}

export async function upsertMemory(
  project_id: string,
  source_type: string,
  items: UpsertMemoryItem[]
): Promise<number> {
  if (!items.length) return 0;

  const client = await pool.connect();
  try {
    await ensureIndex(client);

    const values: string[] = [];
    const params: any[] = [];
    let index = 1;

    for (const item of items) {
      const piiTags = item.pii_tags && item.pii_tags.length ? item.pii_tags : null;
      const lineage = item.lineage ? JSON.stringify(item.lineage) : null;
      values.push(`($${index++}, $${index++}, $${index++}, $${index++}::vector, $${index++}::text[], $${index++}::jsonb)`);
      params.push(project_id);
      params.push(source_type);
      params.push(item.text);
      params.push(toVectorLiteral(item.embedding));
      params.push(piiTags);
      params.push(lineage);
    }

    const query = `
      INSERT INTO memory_items (project_id, source_type, text, embedding, pii_tags, lineage)
      VALUES ${values.join(",")}
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    const result = await client.query(query, params);
    return result.rowCount ?? 0;
  } finally {
    client.release();
  }
}
