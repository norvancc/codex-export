import fs from "node:fs/promises";
import path from "node:path";
import type {
  ConversationMessage,
  ParsedSession,
  SessionInfo,
  SessionStatistics,
  TimelineEvent,
  ToolCall,
  ToolResult
} from "./types.js";
import { cleanConversationText, cleanToolOutput, extractText, makeTitleFromPrompt, sanitizeConversationText } from "./content.js";
import { fileNameFromPath, normalizeWhitespace, toDate, uniqueStrings } from "./utils.js";

interface JsonLine {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

export async function parseSessionFile(filePath: string): Promise<ParsedSession> {
  const raw = await fs.readFile(filePath, "utf8");
  const stat = await fs.stat(filePath);
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);

  const messages: ConversationMessage[] = [];
  const fallbackMessages: ConversationMessage[] = [];
  const toolCalls = new Map<string, ToolCall>();
  const timeline: TimelineEvent[] = [];
  const modifiedFiles = new Set<string>();

  let sessionId = "";
  let createdAt: Date | undefined;
  let metadataTitle = "";

  for (const line of lines) {
    const entry = parseJsonLine(line);
    if (!entry) continue;

    const timestamp = toDate(entry.timestamp);
    const payload = entry.payload ?? {};
    const payloadType = String(payload.type ?? "");

    if (entry.type === "session_meta") {
      sessionId = stringValue(payload.id) || sessionId;
      createdAt = toDate(payload.timestamp) ?? timestamp ?? createdAt;
      metadataTitle = stringValue(payload.title) || stringValue(payload.name) || metadataTitle;
      continue;
    }

    if (entry.type === "event_msg" && payloadType === "user_message") {
      const content = sanitizeConversationText(stringValue(payload.message));
      if (content) {
        pushMessage(messages, { role: "user", content, timestamp, source: "event" });
        timeline.push({ timestamp, label: "User prompt", detail: firstLine(content) });
      }
      continue;
    }

    if (entry.type === "event_msg" && payloadType === "agent_message") {
      const content = sanitizeConversationText(stringValue(payload.message));
      if (content) {
        pushMessage(messages, { role: "assistant", content, timestamp, source: "event" });
        timeline.push({ timestamp, label: "Assistant response", detail: firstLine(content) });
      }
      continue;
    }

    if (entry.type === "response_item" && payloadType === "message") {
      const role = stringValue(payload.role) as ConversationMessage["role"];
      if (role === "user" || role === "assistant") {
        const content = sanitizeConversationText(extractText(payload.content));
        if (content && !looksLikeInjectedContext(content)) {
          fallbackMessages.push({ role, content, timestamp, source: "response" });
        }
      }
      continue;
    }

    if (entry.type === "compacted" && payload.message) {
      const content = sanitizeConversationText(stringValue(payload.message));
      if (content) {
        fallbackMessages.push({ role: "system", content, timestamp, source: "compaction" });
      }
      continue;
    }

    if (entry.type === "response_item" && (payloadType === "function_call" || payloadType === "custom_tool_call" || payloadType === "web_search_call")) {
      const id = stringValue(payload.call_id) || `tool-${toolCalls.size + 1}`;
      const name = stringValue(payload.name) || payloadType.replace(/_call$/, "");
      const args = payload.arguments ?? payload.input ?? payload.action;
      const call = upsertToolCall(toolCalls, id, { id, name, timestamp, arguments: parseMaybeJson(args) });
      if (call.command) timeline.push({ timestamp, label: "Command", detail: call.command });
      else timeline.push({ timestamp, label: `Tool call: ${name}` });
      continue;
    }

    if (entry.type === "event_msg" && payloadType === "exec_command_end") {
      const id = stringValue(payload.call_id) || `exec-${toolCalls.size + 1}`;
      const command = stringValue(payload.command);
      const call = upsertToolCall(toolCalls, id, {
        id,
        name: "exec_command",
        timestamp,
        command,
        cwd: stringValue(payload.cwd),
        source: stringValue(payload.source)
      });
      call.result = {
        callId: id,
        timestamp,
        stdout: cleanToolOutput(stringValue(payload.stdout)),
        stderr: cleanToolOutput(stringValue(payload.stderr)),
        output: cleanToolOutput(stringValue(payload.aggregated_output) || stringValue(payload.formatted_output)),
        exitCode: numberValue(payload.exit_code),
        durationMs: numberValue(payload.duration)
      };
      timeline.push({ timestamp, label: "Command finished", detail: command || `exit ${call.result.exitCode ?? "unknown"}` });
      collectModifiedFiles(command, call.result.output, modifiedFiles);
      continue;
    }

    if (entry.type === "event_msg" && payloadType === "patch_apply_end") {
      const id = stringValue(payload.call_id) || `patch-${toolCalls.size + 1}`;
      const call = upsertToolCall(toolCalls, id, {
        id,
        name: "apply_patch",
        timestamp
      });
      call.result = {
        callId: id,
        timestamp,
        stdout: cleanToolOutput(stringValue(payload.stdout)),
        stderr: cleanToolOutput(stringValue(payload.stderr)),
        success: Boolean(payload.success)
      };
      collectPatchFiles(payload.changes, modifiedFiles);
      timeline.push({ timestamp, label: "Patch applied", detail: call.result.success ? "success" : "failed" });
      continue;
    }

    if (entry.type === "event_msg" && payloadType === "mcp_tool_call_end") {
      const invocation = payload.invocation as Record<string, unknown> | undefined;
      const id = stringValue(payload.call_id) || `mcp-${toolCalls.size + 1}`;
      const name = stringValue(invocation?.tool) || stringValue(invocation?.name) || "mcp_tool";
      const call = upsertToolCall(toolCalls, id, {
        id,
        name,
        timestamp,
        arguments: invocation
      });
      call.result = {
        callId: id,
        timestamp,
        output: cleanToolOutput(safeStringify(payload.result)),
        durationMs: numberValue(payload.duration)
      };
      timeline.push({ timestamp, label: `Tool finished: ${name}` });
      continue;
    }

    if (entry.type === "response_item" && (payloadType === "function_call_output" || payloadType === "custom_tool_call_output")) {
      const id = stringValue(payload.call_id) || `tool-output-${toolCalls.size + 1}`;
      const call = upsertToolCall(toolCalls, id, { id, name: "tool_output", timestamp });
      call.result = mergeResult(call.result, {
        callId: id,
        timestamp,
        output: cleanToolOutput(extractText(payload.output) || safeStringify(payload.output))
      });
      continue;
    }

    if (entry.type === "event_msg" && payloadType === "web_search_end") {
      const id = stringValue(payload.call_id) || `web-${toolCalls.size + 1}`;
      const call = upsertToolCall(toolCalls, id, {
        id,
        name: "web_search",
        timestamp,
        arguments: payload.query || payload.action
      });
      call.result = {
        callId: id,
        timestamp,
        output: cleanToolOutput(safeStringify(payload.action))
      };
      continue;
    }
  }

  const selectedMessages = messages.length > 0 ? messages : dedupeMessages(fallbackMessages);
  const orderedToolCalls = [...toolCalls.values()].sort(compareTimestamp);
  const firstUserPrompt = selectedMessages.find((message) => message.role === "user")?.content ?? "";
  const title = metadataTitle || makeTitleFromPrompt(firstUserPrompt) || fileNameFromPath(filePath);
  const info = makeSessionInfo({
    filePath,
    stat,
    sessionId,
    title,
    createdAt,
    messages: selectedMessages,
    toolCalls: orderedToolCalls
  });

  const statistics = makeStatistics(info, selectedMessages, orderedToolCalls, modifiedFiles, createdAt);
  return {
    info,
    messages: selectedMessages,
    toolCalls: orderedToolCalls,
    timeline: timeline.sort(compareTimelineTimestamp),
    statistics,
    summary: makeSummary(selectedMessages)
  };
}

export async function readSessionInfo(filePath: string): Promise<SessionInfo> {
  const raw = await fs.readFile(filePath, "utf8");
  const stat = await fs.stat(filePath);
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);

  let sessionId = "";
  let createdAt: Date | undefined;
  let metadataTitle = "";
  let firstUserPrompt = "";
  let fallbackUserPrompt = "";

  const metaLine = lines.find((line) => /"type"\s*:\s*"session_meta"/.test(line));
  if (metaLine) {
    const entry = parseJsonLine(metaLine);
    const payload = entry?.payload ?? {};
    sessionId = stringValue(payload.id);
    createdAt = toDate(payload.timestamp) ?? toDate(entry?.timestamp);
    metadataTitle = stringValue(payload.title) || stringValue(payload.name);
  }

  const userLine = lines.find((line) => /"type"\s*:\s*"user_message"/.test(line));
  if (userLine) {
    const entry = parseJsonLine(userLine);
    firstUserPrompt = cleanConversationText(stringValue(entry?.payload?.message), 1_000);
  }

  if (!firstUserPrompt) {
    const fallbackLine = lines.find((line) => /"type"\s*:\s*"message"/.test(line) && /"role"\s*:\s*"user"/.test(line));
    if (fallbackLine) {
      const entry = parseJsonLine(fallbackLine);
      const content = cleanConversationText(extractText(entry?.payload?.content), 1_000);
      if (content && !looksLikeInjectedContext(content)) fallbackUserPrompt = content;
    }
  }

  const userMessages = countMatches(raw, /"type"\s*:\s*"user_message"/g);
  const assistantMessages = countMatches(raw, /"type"\s*:\s*"agent_message"/g);
  const eventMessages = userMessages + assistantMessages;
  const fallbackMessages = eventMessages > 0
    ? 0
    : countMatches(raw, /"type"\s*:\s*"message"/g);
  const callStarts = countMatches(raw, /"type"\s*:\s*"(?:function_call|custom_tool_call|web_search_call)"/g);
  const callEnds = countMatches(raw, /"type"\s*:\s*"(?:exec_command_end|patch_apply_end|mcp_tool_call_end|web_search_end)"/g);

  const messageCount = eventMessages || fallbackMessages;
  const title = metadataTitle || makeTitleFromPrompt(firstUserPrompt || fallbackUserPrompt) || fileNameFromPath(filePath);
  return {
    id: sessionId || extractIdFromFilename(filePath) || path.basename(filePath, ".jsonl"),
    title,
    filePath,
    createdAt: createdAt ?? stat.birthtime ?? stat.ctime,
    updatedAt: stat.mtime,
    messageCount,
    userMessageCount: userMessages,
    assistantMessageCount: assistantMessages,
    toolCallCount: Math.max(callStarts, callEnds)
  };
}

function countMatches(input: string, pattern: RegExp): number {
  let count = 0;
  for (const _match of input.matchAll(pattern)) count += 1;
  return count;
}

function parseJsonLine(line: string): JsonLine | undefined {
  try {
    const parsed = JSON.parse(line) as JsonLine;
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function pushMessage(messages: ConversationMessage[], message: ConversationMessage): void {
  const last = messages[messages.length - 1];
  if (last && last.role === message.role && last.content === message.content) return;
  messages.push(message);
}

function dedupeMessages(messages: ConversationMessage[]): ConversationMessage[] {
  const result: ConversationMessage[] = [];
  for (const message of messages) pushMessage(result, message);
  return result;
}

function looksLikeInjectedContext(content: string): boolean {
  return content.includes("[environment context removed]")
    || content.includes("<developer")
    || content.includes("You are Codex, a coding agent");
}

function upsertToolCall(calls: Map<string, ToolCall>, id: string, patch: ToolCall): ToolCall {
  const existing = calls.get(id);
  if (!existing) {
    calls.set(id, patch);
    return patch;
  }
  Object.assign(existing, removeUndefinedFields(patch));
  if (patch.result) existing.result = mergeResult(existing.result, patch.result);
  return existing;
}

function mergeResult(existing: ToolResult | undefined, patch: ToolResult): ToolResult {
  return {
    ...existing,
    ...removeUndefinedFields(patch),
    callId: patch.callId || existing?.callId || ""
  };
}

function removeUndefinedFields<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "")) as Partial<T>;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return trimmed;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function safeStringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function makeSessionInfo(input: {
  filePath: string;
  stat: { birthtime: Date; ctime: Date; mtime: Date };
  sessionId: string;
  title: string;
  createdAt?: Date;
  messages: ConversationMessage[];
  toolCalls: ToolCall[];
}): SessionInfo {
  const fallbackId = extractIdFromFilename(input.filePath) || path.basename(input.filePath, ".jsonl");
  const createdAt = input.createdAt ?? input.stat.birthtime ?? input.stat.ctime;
  const updatedAt = input.stat.mtime;
  const userMessageCount = input.messages.filter((message) => message.role === "user").length;
  const assistantMessageCount = input.messages.filter((message) => message.role === "assistant").length;
  return {
    id: input.sessionId || fallbackId,
    title: input.title,
    filePath: input.filePath,
    createdAt,
    updatedAt,
    messageCount: input.messages.length,
    userMessageCount,
    assistantMessageCount,
    toolCallCount: input.toolCalls.length
  };
}

function extractIdFromFilename(filePath: string): string {
  const name = path.basename(filePath, ".jsonl");
  const match = name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match?.[1] ?? "";
}

function makeStatistics(
  info: SessionInfo,
  messages: ConversationMessage[],
  toolCalls: ToolCall[],
  modifiedFiles: Set<string>,
  createdAt?: Date
): SessionStatistics {
  const firstMessageTime = messages.find((message) => message.timestamp)?.timestamp;
  const start = createdAt ?? firstMessageTime ?? info.createdAt;
  const end = info.updatedAt;
  return {
    messages: messages.length,
    userMessages: info.userMessageCount,
    assistantMessages: info.assistantMessageCount,
    toolCalls: toolCalls.length,
    commandsExecuted: toolCalls.filter((call) => call.name === "exec_command" || Boolean(call.command)).length,
    filesModified: modifiedFiles.size,
    durationMs: start && end ? end.getTime() - start.getTime() : undefined
  };
}

function makeSummary(messages: ConversationMessage[]) {
  const userMessages = messages.filter((message) => message.role === "user").map((message) => message.content);
  const assistantMessages = messages.filter((message) => message.role === "assistant").map((message) => message.content);
  const all = [...userMessages, ...assistantMessages];
  const objective = firstSentence(userMessages[0]) || "Review and continue an AI-assisted development session.";
  const keyDecisions = uniqueStrings(
    assistantMessages.flatMap((message) => extractSentencesMatching(message, /\b(decid|choose|approach|use|implemented|changed|moved|added|removed)\w*/i)),
    5
  );
  const problemsEncountered = uniqueStrings(
    all.flatMap((message) => extractSentencesMatching(message, /\b(error|failed|failure|blocked|issue|problem|bug|warning|conflict)\w*/i)),
    5
  );
  const finalOutcome = firstSentence(assistantMessages.at(-1)) || "No final assistant outcome was recorded.";
  const nextActions = uniqueStrings(
    all.flatMap((message) => extractSentencesMatching(message, /\b(next|todo|follow[- ]?up|remaining|later)\b/i)),
    5
  );

  return {
    objective,
    keyDecisions: keyDecisions.length > 0 ? keyDecisions : ["No explicit decisions were detected."],
    problemsEncountered: problemsEncountered.length > 0 ? problemsEncountered : ["No explicit problems were detected."],
    finalOutcome,
    nextActions: nextActions.length > 0 ? nextActions : ["No explicit next actions were detected."]
  };
}

function firstSentence(input: string | undefined): string {
  if (!input) return "";
  const normalized = normalizeWhitespace(input).replace(/\n+/g, " ");
  const match = normalized.match(/^(.{1,240}?[.!?。！？])(?:\s|$)/);
  const sentence = match?.[1] ?? normalized.slice(0, 240);
  return sentence.trim();
}

function extractSentencesMatching(input: string, pattern: RegExp): string[] {
  const normalized = normalizeWhitespace(input).replace(/\n+/g, " ");
  const sentences = normalized.match(/[^.!?。！？]+[.!?。！？]?/g) ?? [];
  return sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 12 && sentence.length < 280 && pattern.test(sentence));
}

function firstLine(input: string): string {
  return input.split("\n").find((line) => line.trim().length > 0)?.trim().slice(0, 140) ?? "";
}

function compareTimestamp(a: ToolCall, b: ToolCall): number {
  return (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0);
}

function compareTimelineTimestamp(a: TimelineEvent, b: TimelineEvent): number {
  return (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0);
}

function collectModifiedFiles(command: string, output: string | undefined, files: Set<string>): void {
  const text = `${command}\n${output ?? ""}`;
  const patterns = [
    /\b(?:apply_patch|touch|mv|cp|rm|mkdir|chmod)\s+([^\s]+)/g,
    /\b(?:created|modified|updated|deleted|renamed):\s+([^\s]+)/gi,
    /\b([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|html|yml|yaml|toml|rs|go|py|java|kt|swift|vue|svelte))\b/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = match[1]?.replace(/^["']|["']$/g, "");
      if (candidate && !candidate.includes("node_modules")) files.add(candidate);
    }
  }
}

function collectPatchFiles(changes: unknown, files: Set<string>): void {
  if (!changes) return;
  const text = safeStringify(changes);
  for (const match of text.matchAll(/"?(?:path|file|filename)"?\s*:?\s*"([^"]+)"/g)) {
    if (match[1]) files.add(match[1]);
  }
}
