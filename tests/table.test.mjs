import assert from "node:assert/strict";
import { test } from "node:test";
import { renderSessionTable, renderSessionTableHeader, renderSessionTableRow } from "../dist/table.js";

test("renders sessions as an ascii table", () => {
  const table = renderSessionTable([
    {
      id: "019e8c28-1234-5678-90ab-cdef12345678",
      title: "Build Codex Session Exporter",
      filePath: "/tmp/session.jsonl",
      createdAt: new Date("2026-06-03T08:00:00Z"),
      updatedAt: new Date("2026-06-03T08:30:00Z"),
      messageCount: 17,
      userMessageCount: 5,
      assistantMessageCount: 12,
      toolCallCount: 28
    },
    {
      id: "019e8294",
      title: "增加功能，生成 jira 单子，并保留对话链接",
      filePath: "/tmp/session-2.jsonl",
      createdAt: new Date("2026-06-03T09:00:00Z"),
      updatedAt: new Date("2026-06-03T09:45:00Z"),
      messageCount: 182,
      userMessageCount: 60,
      assistantMessageCount: 122,
      toolCallCount: 428
    }
  ], 88);

  const lines = table.split("\n");
  assert.match(lines[0], /^\+-+\+-+\+-+\+-+\+-+\+$/);
  assert.match(table, /\| ID\s+\| Updated\s+\|/);
  assert.match(table, /Build Codex Session Exporter/);
  assert.match(table, /增加功能/);
  assert.ok(lines.every((line) => line.startsWith("|") || line.startsWith("+")));
  assert.ok(lines.every((line) => line.endsWith("|") || line.endsWith("+")));
});

test("renders reusable table parts for interactive prompts", () => {
  const session = {
    id: "019e8c28-1234-5678-90ab-cdef12345678",
    title: "Build Codex Session Exporter",
    filePath: "/tmp/session.jsonl",
    createdAt: new Date("2026-06-03T08:00:00Z"),
    updatedAt: new Date("2026-06-03T08:30:00Z"),
    messageCount: 17,
    userMessageCount: 5,
    assistantMessageCount: 12,
    toolCallCount: 28
  };

  const header = renderSessionTableHeader(88);
  const row = renderSessionTableRow(session, 88);

  assert.equal(header.length, 3);
  assert.match(header[1], /\| ID\s+\| Updated\s+\|/);
  assert.match(row, /\| 019e8c28\s+\|/);
  assert.match(row, /\|\s+17 \|\s+28 \|/);
  assert.match(row, /Build Codex Session Exporter/);
});
