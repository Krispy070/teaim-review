import { test } from "node:test";
import assert from "node:assert/strict";
import { embedText } from "./embed";

const shouldSkip = !process.env.OPENAI_API_KEY;

test('embeds text when API key present', { skip: shouldSkip }, async () => {
  const [embedding] = await embedText(["hello world"]);
  assert.ok(Array.isArray(embedding));
  assert.equal(embedding.length, 1536);
});

if (shouldSkip) {
  test('skipped embed test due to missing OPENAI_API_KEY', { skip: true }, () => {});
}
