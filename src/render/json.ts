import type { ParsedSession } from "../types.js";
import { cleanConversationText, cleanToolOutput } from "../content.js";

interface JsonOptions {
  includeTools: boolean;
  includeToolResults: boolean;
  clean: boolean;
}

export function renderJson(session: ParsedSession, options: JsonOptions): string {
  const payload = {
    session: {
      ...session.info,
      createdAt: session.info.createdAt.toISOString(),
      updatedAt: session.info.updatedAt.toISOString()
    },
    summary: session.summary,
    statistics: session.statistics,
    conversation: session.messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        ...message,
        timestamp: message.timestamp?.toISOString(),
        content: options.clean ? cleanConversationText(message.content) : message.content
      })),
    toolCalls: options.includeTools ? session.toolCalls.map((call) => ({
      ...call,
      timestamp: call.timestamp?.toISOString(),
      result: options.includeToolResults && call.result ? {
        ...call.result,
        timestamp: call.result.timestamp?.toISOString(),
        stdout: call.result.stdout ? cleanToolOutput(call.result.stdout) : undefined,
        stderr: call.result.stderr ? cleanToolOutput(call.result.stderr) : undefined,
        output: call.result.output ? cleanToolOutput(call.result.output) : undefined
      } : undefined
    })) : undefined
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}
