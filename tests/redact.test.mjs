import assert from "node:assert/strict";
import { test } from "node:test";
import { redactSecrets } from "../dist/redact.js";

test("redacts common API keys and authorization headers", () => {
  const input = [
    "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456",
    "ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz.123456789",
    "AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP"
  ].join("\n");

  const output = redactSecrets(input);
  assert.equal(output.includes("abcdefghijklmnopqrstuvwxyz"), false);
  assert.match(output, /OPENAI_API_KEY=\*+/);
  assert.match(output, /Authorization: \*+/);
  assert.match(output, /AKIA\*+/);
});
