import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { retrieve, __setMemoryTestOverrides, __resetMemoryTestOverrides } from "./retrieve";

const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
const describeFn = hasOpenAIKey ? describe : describe.skip;

const dataset = [
  {
    id: "release-doc",
    text: "Release notes for sprint 42",
    source_type: "docs",
    lineage: { title: "Release Notes" },
    created_at: new Date("2024-05-01T00:00:00.000Z").toISOString(),
    embedding: [1, 0, 0],
  },
  {
    id: "slack-thread",
    text: "Slack thread discussing an unrelated topic",
    source_type: "slack",
    lineage: null,
    created_at: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    embedding: [0, 1, 0],
  },
  {
    id: "design-meeting",
    text: "Design review sync covering implementation details",
    source_type: "meetings",
    lineage: { tags: ["design", "review"] },
    created_at: new Date("2024-03-15T00:00:00.000Z").toISOString(),
    embedding: [0.7, 0.7, 0],
  },
];

const fakePool = {
  async query(sql: string, params?: unknown[]) {
    if (sql.includes("information_schema")) {
      return { rows: [] };
    }
    if (sql.includes("plainto_tsquery")) {
      return { rows: [] };
    }
    if (sql.includes("ORDER BY embedding <->")) {
      return { rows: dataset };
    }
    if (sql.includes("ANY($2)")) {
      const idsParam = Array.isArray(params) ? params[1] : undefined;
      const ids = Array.isArray(idsParam) ? (idsParam as string[]) : [];
      return { rows: dataset.filter((row) => ids.includes(row.id)) };
    }
    throw new Error(`Unexpected SQL in test: ${sql}`);
  },
};

const fakeOpenAI = {
  embeddings: {
    async create() {
      return {
        data: [
          {
            embedding: [1, 0, 0],
          },
        ],
      };
    },
  },
};

describeFn("memory hybrid retrieval", () => {
  const originalDateNow = Date.now;
  const originalEmbedModel = process.env.MEMORY_EMBED_MODEL;

  before(() => {
    process.env.MEMORY_EMBED_MODEL = originalEmbedModel ?? "test-embed";
    process.env.MEMORY_ENABLED = "1";
    __setMemoryTestOverrides({
      pool: fakePool,
      openai: fakeOpenAI as any,
      embedModel: "test-embed",
    });
    (Date as any).now = () => new Date("2024-06-01T00:00:00.000Z").getTime();
  });

  after(() => {
    (Date as any).now = originalDateNow;
    if (originalEmbedModel === undefined) {
      delete process.env.MEMORY_EMBED_MODEL;
    } else {
      process.env.MEMORY_EMBED_MODEL = originalEmbedModel;
    }
    delete process.env.MEMORY_ENABLED;
    __resetMemoryTestOverrides();
  });

  it("ranks contexts using hybrid weights", async () => {
    const result = await retrieve({
      project_id: "proj-1",
      query: "release notes",
      k: 3,
      phase: "Release",
    });

    assert.equal(result.contexts.length, 3);
    assert.equal(result.contexts[0].id, "release-doc");
    assert.ok(result.contexts[0].score > result.contexts[1].score);
    assert.equal(result.debug.mode, "hybrid");
    assert.equal(result.debug.raw.candidateCount, dataset.length);
  });
});
