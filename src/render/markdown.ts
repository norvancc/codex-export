import type { ParsedSession, ToolCall } from "../types.js";
import { formatDate, formatDuration } from "../utils.js";
import { cleanConversationText, cleanToolOutput } from "../content.js";

interface MarkdownOptions {
  includeTools: boolean;
  includeToolResults: boolean;
  clean: boolean;
}

export function renderMarkdown(session: ParsedSession, options: MarkdownOptions): string {
  const lines: string[] = [];
  const title = options.clean ? session.info.title : "Codex Session";

  lines.push(`# ${title || "Codex Session"}`);
  lines.push("");
  lines.push(`Session ID: ${session.info.id}`);
  lines.push("");
  lines.push(`Created: ${formatDate(session.info.createdAt)}`);
  lines.push("");
  lines.push(`Updated: ${formatDate(session.info.updatedAt)}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`Objective: ${session.summary.objective}`);
  lines.push("");
  lines.push("Key decisions:");
  for (const item of session.summary.keyDecisions) lines.push(`- ${item}`);
  lines.push("");
  lines.push("Problems encountered:");
  for (const item of session.summary.problemsEncountered) lines.push(`- ${item}`);
  lines.push("");
  lines.push(`Final outcome: ${session.summary.finalOutcome}`);
  lines.push("");
  lines.push("Next actions:");
  for (const item of session.summary.nextActions) lines.push(`- ${item}`);
  lines.push("");

  lines.push("## Statistics");
  lines.push("");
  lines.push(`Messages: ${session.statistics.messages}`);
  lines.push("");
  lines.push(`User Messages: ${session.statistics.userMessages}`);
  lines.push("");
  lines.push(`Assistant Messages: ${session.statistics.assistantMessages}`);
  lines.push("");
  lines.push(`Tool Calls: ${session.statistics.toolCalls}`);
  lines.push("");
  lines.push(`Duration: ${formatDuration(session.statistics.durationMs)}`);
  lines.push("");
  lines.push(`Files Modified: ${session.statistics.filesModified}`);
  lines.push("");
  lines.push(`Commands Executed: ${session.statistics.commandsExecuted}`);
  lines.push("");

  lines.push("## Conversation");
  lines.push("");
  for (const message of session.messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    lines.push(`### ${capitalize(message.role)}`);
    lines.push("");
    lines.push(options.clean ? cleanConversationText(message.content) : message.content);
    lines.push("");
  }

  if (options.includeTools) {
    lines.push("## Tool Calls");
    lines.push("");
    if (session.toolCalls.length === 0) {
      lines.push("No tool calls were recorded.");
      lines.push("");
    } else {
      for (const call of session.toolCalls) {
        renderToolCall(lines, call, options.includeToolResults);
      }
    }
  }

  return `${lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim()}\n`;
}

function renderToolCall(lines: string[], call: ToolCall, includeResult: boolean): void {
  lines.push(`### ${toolTitle(call)}`);
  lines.push("");
  if (call.timestamp) {
    lines.push(`Time: ${formatDate(call.timestamp)}`);
    lines.push("");
  }
  if (call.cwd) {
    lines.push(`Working directory: \`${call.cwd}\``);
    lines.push("");
  }
  if (call.command) {
    lines.push("```bash");
    lines.push(call.command);
    lines.push("```");
    lines.push("");
  } else if (call.arguments !== undefined) {
    lines.push("```json");
    lines.push(formatJson(call.arguments));
    lines.push("```");
    lines.push("");
  }

  if (!includeResult || !call.result) return;

  if (call.result.exitCode !== undefined) {
    lines.push(`Exit code: ${call.result.exitCode}`);
    lines.push("");
  }

  const result = call.result.output || joinOutput(call.result.stdout, call.result.stderr);
  if (result) {
    lines.push("Result:");
    lines.push("");
    lines.push("```text");
    lines.push(cleanToolOutput(result));
    lines.push("```");
    lines.push("");
  }
}

function toolTitle(call: ToolCall): string {
  if (call.name === "exec_command") return "Bash";
  if (call.name === "apply_patch") return "Patch";
  return call.name.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function joinOutput(stdout?: string, stderr?: string): string {
  return [stdout, stderr].filter(Boolean).join("\n\n");
}

function formatJson(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function capitalize(input: string): string {
  return input.slice(0, 1).toUpperCase() + input.slice(1);
}
