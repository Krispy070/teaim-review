import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "./redact";

test("redacts email addresses in standard mode", () => {
  const result = redact("Contact me at someone@example.com for details.");
  assert.equal(result.clean.includes("[REDACTED:EMAIL]"), true);
  assert.ok(result.tags.includes("EMAIL"));
});

test("strict mode redacts phone numbers", () => {
  const result = redact("Call 415-555-1234 to reach support.", "strict");
  assert.equal(result.clean.includes("[REDACTED:PHONE]"), true);
  assert.ok(result.tags.includes("PHONE"));
});

test("off policy leaves content untouched", () => {
  const text = "Email jane@example.com or dial 212-555-9876.";
  const result = redact(text, "off");
  assert.equal(result.clean, text);
  assert.deepEqual(result.tags, []);
});
