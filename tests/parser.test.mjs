import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseSessionFile } from "../dist/parser.js";
import { renderSession } from "../dist/render/index.js";

test("parses Codex JSONL sessions and renders markdown", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-export-"));
  const file = path.join(dir, "rollout-2026-06-03T08-00-00-demo-session-001.jsonl");
  await fs.copyFile(path.resolve("examples/session.sample.jsonl"), file);

  const session = await parseSessionFile(file);
  assert.equal(session.info.id, "demo-session-001");
  assert.equal(session.info.messageCount, 2);
  assert.equal(session.statistics.toolCalls, 1);
  assert.equal(session.statistics.commandsExecuted, 1);

  const markdown = renderSession(session, "md", "with-tool-results");
  assert.match(markdown, /^# Codex Session/m);
  assert.match(markdown, /Objective: Build a small CLI/);
  assert.match(markdown, /## Statistics/);
  assert.match(markdown, /```bash\nnpm test\n```/);
  assert.match(markdown, /ok 1 parser test/);
});
