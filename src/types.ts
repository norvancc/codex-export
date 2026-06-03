export type ExportFormat = "md" | "html" | "json";

export type ExportScope =
  | "clean"
  | "full"
  | "with-tools"
  | "with-tool-results";

export type MessageRole = "user" | "assistant" | "system" | "developer" | "tool";

export interface SessionInfo {
  id: string;
  title: string;
  filePath: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
}

export interface ConversationMessage {
  role: MessageRole;
  content: string;
  timestamp?: Date;
  source: "event" | "response" | "metadata" | "compaction";
}

export interface ToolResult {
  callId: string;
  timestamp?: Date;
  stdout?: string;
  stderr?: string;
  output?: string;
  exitCode?: number;
  durationMs?: number;
  success?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  timestamp?: Date;
  arguments?: unknown;
  command?: string;
  cwd?: string;
  source?: string;
  result?: ToolResult;
}

export interface TimelineEvent {
  timestamp?: Date;
  label: string;
  detail?: string;
}

export interface SessionStatistics {
  messages: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  commandsExecuted: number;
  filesModified: number;
  durationMs?: number;
}

export interface SessionSummary {
  objective: string;
  keyDecisions: string[];
  problemsEncountered: string[];
  finalOutcome: string;
  nextActions: string[];
}

export interface ParsedSession {
  info: SessionInfo;
  messages: ConversationMessage[];
  toolCalls: ToolCall[];
  timeline: TimelineEvent[];
  statistics: SessionStatistics;
  summary: SessionSummary;
}

export interface ExportOptions {
  format: ExportFormat;
  scope: ExportScope;
  output?: string;
  sessionDir?: string;
}

export interface ReportOptions extends ExportOptions {
  title: string;
  sessions: ParsedSession[];
}
