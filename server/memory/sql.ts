export interface AnnVectorQuery {
  text: string;
  values: unknown[];
}

function toVectorLiteral(embed: number[]): string {
  if (!Array.isArray(embed) || embed.length === 0) {
    throw new Error("Embedding vector is required for ANN query");
  }

  const sanitized = embed.map((value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0";
    return Number(num.toFixed(12));
  });

  return `[${sanitized.join(",")}]`;
}

export function annVectorQuery(projectId: string, embed: number[], limit: number): AnnVectorQuery {
  const vecLiteral = toVectorLiteral(embed);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 200;

  return {
    text: `SELECT id, text, source_type, lineage, created_at, embedding\n           FROM memory_items\n           WHERE project_id = $1 AND embedding IS NOT NULL\n           ORDER BY embedding <-> ${vecLiteral}::vector\n           LIMIT ${safeLimit}`,
    values: [projectId]
  };
}
