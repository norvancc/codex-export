import { normalizeWhitespace, truncateMiddle } from "./utils.js";
import { redactSecrets } from "./redact.js";

export function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((item) => extractTextFromPart(item)).filter(Boolean).join("\n\n");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.message === "string") return record.message;
    if (typeof record.output === "string") return record.output;
    if (typeof record.content === "string" || Array.isArray(record.content)) return extractText(record.content);
  }
  return "";
}

function extractTextFromPart(part: unknown): string {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  const record = part as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.content)) return extractText(record.content);
  return "";
}

export function cleanConversationText(input: string, maxLength = 12_000): string {
  let output = redactSecrets(input);
  output = output.replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, "[environment context removed]");
  output = output.replace(/<permissions instructions>[\s\S]*?<\/permissions instructions>/gi, "[permissions context removed]");
  output = output.replace(/<collaboration_mode>[\s\S]*?<\/collaboration_mode>/gi, "[collaboration context removed]");
  output = output.replace(/^\s*Token usage:.*$/gim, "");
  output = output.replace(/^\s*(telemetry|rate_limits?|model_context_window)\b.*$/gim, "");
  output = normalizeWhitespace(output);
  return truncateMiddle(output, maxLength);
}

export function sanitizeConversationText(input: string, maxLength = 100_000): string {
  const output = normalizeWhitespace(redactSecrets(input));
  return truncateMiddle(output, maxLength);
}

export function cleanToolOutput(input: string, maxLength = 4_000): string {
  let output = redactSecrets(input);
  output = output.replace(/^\s*(npm notice|added \d+ packages|funding|audit).*$/gim, "");
  output = output.replace(/\n?[-+]{3,} .*\n@@[\s\S]*?(?=\n(?:[-+]{3,}|diff --git|$))/g, "\n[diff output removed]\n");
  output = output.replace(/(?:\n.*){80,}/g, (match) => truncateMiddle(match, maxLength));
  output = normalizeWhitespace(output);
  return truncateMiddle(output, maxLength);
}

export function makeTitleFromPrompt(input: string): string {
  const cleaned = cleanConversationText(input, 1_000)
    .replace(/\[[^\]]+ removed\]/g, "")
    .replace(/[`*_>#-]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!cleaned) return "";
  const words = cleaned.replace(/\s+/g, " ");
  return words.length <= 72 ? words : `${words.slice(0, 69).trimEnd()}...`;
}
