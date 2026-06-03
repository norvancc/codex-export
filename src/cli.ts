#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { input, search, select, Separator } from "@inquirer/prompts";
import { discoverSessions, findSessionById } from "./discovery.js";
import { parseSessionFile } from "./parser.js";
import { extensionForFormat, renderSession } from "./render/index.js";
import { renderMergedReport, renderTimelineReport } from "./reports.js";
import { renderSessionTable, renderSessionTableHeader, renderSessionTableRow } from "./table.js";
import type { ExportFormat, ExportScope, ParsedSession, SessionInfo } from "./types.js";
import { expandHome, isCurrentWeek, isToday, shortId, slugify } from "./utils.js";

interface CliOptions {
  list?: boolean;
  last?: boolean;
  id?: string;
  file?: string;
  format?: string;
  clean?: boolean;
  full?: boolean;
  withTools?: boolean;
  withToolResults?: boolean;
  output?: string;
  all?: boolean;
  daily?: boolean;
  weekly?: boolean;
  timeline?: boolean;
  sessionsDir?: string;
}

const program = new Command();

program
  .name("codex-export")
  .description("Export OpenAI Codex CLI sessions into Markdown, HTML, or JSON.")
  .version("0.1.0")
  .option("--list", "list discovered sessions")
  .option("--last", "export the most recently modified session")
  .option("--id <sessionId>", "export a session by id or id prefix")
  .option("--file <path>", "export a specific session JSONL file")
  .option("--format <format>", "output format: md, html, json", "md")
  .option("--clean", "export clean conversation only")
  .option("--full", "export full user and assistant conversation")
  .option("--with-tools", "include tool calls without tool results")
  .option("--with-tool-results", "include tool calls and tool results")
  .option("--output <path>", "output file or directory")
  .option("--all", "export all sessions")
  .option("--daily", "merge today's sessions into one report")
  .option("--weekly", "merge this week's sessions into one report")
  .option("--timeline", "generate an AI development timeline")
  .option("--sessions-dir <path>", "session directory", "~/.codex/sessions")
  .action(async (options: CliOptions) => {
    try {
      await run(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`codex-export: ${message}`);
      process.exitCode = 1;
    }
  });

await program.parseAsync();

async function run(options: CliOptions): Promise<void> {
  const format = parseFormat(options.format);
  const scope = parseScope(options);

  if (options.list) {
    const sessions = await discoverSessions({ sessionDir: options.sessionsDir });
    printSessionList(sessions);
    return;
  }

  if (options.all) {
    const sessions = await parseDiscoveredSessions(options);
    await exportAll(sessions, format, scope, options.output ?? "exports");
    return;
  }

  if (options.daily || options.weekly || options.timeline) {
    const sessions = await parseDiscoveredSessions(options);
    const filtered = options.daily
      ? sessions.filter((session) => isToday(session.info.updatedAt))
      : options.weekly
        ? sessions.filter((session) => isCurrentWeek(session.info.updatedAt))
        : sessions;
    const title = options.timeline
      ? "Codex Development Timeline"
      : options.daily
        ? "Daily Codex Engineering Report"
        : "Weekly Codex Engineering Report";
    const content = options.timeline
      ? renderTimelineReport(title, filtered, format)
      : renderMergedReport(title, filtered, format, scope);
    await writeOrPrint(content, options.output);
    return;
  }

  if (options.file || options.id || options.last) {
    const session = await resolveSession(options);
    const content = renderSession(session, format, scope);
    await writeOrPrint(content, options.output);
    return;
  }

  await interactiveMode(options.sessionsDir);
}

async function interactiveMode(sessionDir?: string): Promise<void> {
  const sessions = await discoverSessions({ sessionDir });
  if (sessions.length === 0) {
    throw new Error(`No sessions found in ${sessionDir ?? "~/.codex/sessions"}`);
  }

  const selected = await search<SessionInfo>({
    message: "Select a session",
    pageSize: 12,
    source: async (term) => {
      const filtered = fuzzyFilter(sessions, term ?? "");
      const tableWidth = Math.max(60, (process.stdout.columns || 120) - 8);
      return [
        ...renderSessionTableHeader(tableWidth).map((line) => new Separator(line)),
        ...filtered.map((session) => ({
          name: renderSessionTableRow(session, tableWidth),
          short: session.title,
          value: session,
          description: session.filePath
        }))
      ];
    }
  });

  const format = await select<ExportFormat>({
    message: "Export format",
    choices: [
      { name: "Markdown", value: "md" },
      { name: "HTML", value: "html" },
      { name: "JSON", value: "json" }
    ]
  });

  const scope = await select<ExportScope>({
    message: "What would you like to export",
    choices: [
      { name: "Clean Conversation", value: "clean" },
      { name: "Full Conversation", value: "full" },
      { name: "Conversation + Tool Calls", value: "with-tools" },
      { name: "Conversation + Tool Calls + Tool Results", value: "with-tool-results" }
    ]
  });

  const defaultOutput = `./codex-session-${slugify(selected.title)}.${extensionForFormat(format)}`;
  const output = await input({
    message: "Output location",
    default: defaultOutput
  });

  const parsed = await parseSessionFile(selected.filePath);
  await writeOrPrint(renderSession(parsed, format, scope), output);
  console.log(`Exported ${selected.title} to ${output}`);
}

async function resolveSession(options: CliOptions): Promise<ParsedSession> {
  if (options.file) {
    return parseSessionFile(expandHome(options.file));
  }

  const sessions = await discoverSessions({ sessionDir: options.sessionsDir });
  if (sessions.length === 0) throw new Error(`No sessions found in ${options.sessionsDir ?? "~/.codex/sessions"}`);

  const selected = options.last
    ? sessions[0]
    : options.id
      ? findSessionById(sessions, options.id)
      : undefined;

  if (!selected) {
    throw new Error(options.id ? `Session not found: ${options.id}` : "No session selected");
  }
  return parseSessionFile(selected.filePath);
}

async function parseDiscoveredSessions(options: CliOptions): Promise<ParsedSession[]> {
  const infos = await discoverSessions({ sessionDir: options.sessionsDir });
  const sessions: ParsedSession[] = [];
  for (const info of infos) {
    try {
      sessions.push(await parseSessionFile(info.filePath));
    } catch {
      // Ignore unreadable sessions in batch reports.
    }
  }
  return sessions;
}

async function exportAll(sessions: ParsedSession[], format: ExportFormat, scope: ExportScope, outputDir: string): Promise<void> {
  const dir = expandHome(outputDir);
  await fs.mkdir(dir, { recursive: true });
  const ext = extensionForFormat(format);
  for (const session of sessions) {
    const filename = `${slugify(session.info.title)}-${shortId(session.info.id)}.${ext}`;
    const target = path.join(dir, filename);
    await fs.writeFile(target, renderSession(session, format, scope), "utf8");
  }
  console.log(`Exported ${sessions.length} sessions to ${dir}`);
}

async function writeOrPrint(content: string, output?: string): Promise<void> {
  if (!output) {
    process.stdout.write(content);
    return;
  }
  const target = expandHome(output);
  await fs.mkdir(path.dirname(path.resolve(target)), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

function printSessionList(sessions: SessionInfo[]): void {
  if (sessions.length === 0) {
    console.log("No Codex sessions found.");
    return;
  }

  console.log(renderSessionTable(sessions));
}

function parseFormat(value: string | undefined): ExportFormat {
  const normalized = (value ?? "md").toLowerCase();
  if (normalized === "markdown") return "md";
  if (normalized === "md" || normalized === "html" || normalized === "json") return normalized;
  throw new Error(`Unsupported format: ${value}`);
}

function parseScope(options: CliOptions): ExportScope {
  if (options.withToolResults) return "with-tool-results";
  if (options.withTools) return "with-tools";
  if (options.full) return "full";
  if (options.clean) return "clean";
  return "clean";
}

function fuzzyFilter(sessions: SessionInfo[], term: string): SessionInfo[] {
  const query = term.trim().toLowerCase();
  if (!query) return sessions;
  return sessions
    .map((session) => ({ session, score: fuzzyScore(`${session.title} ${session.id} ${session.filePath}`.toLowerCase(), query) }))
    .filter((item) => item.score > -1)
    .sort((a, b) => b.score - a.score || b.session.updatedAt.getTime() - a.session.updatedAt.getTime())
    .map((item) => item.session);
}

function fuzzyScore(haystack: string, query: string): number {
  let score = 0;
  let lastIndex = -1;
  for (const char of query) {
    const index = haystack.indexOf(char, lastIndex + 1);
    if (index === -1) return -1;
    score += index === lastIndex + 1 ? 4 : 1;
    lastIndex = index;
  }
  if (haystack.includes(query)) score += 20;
  return score;
}
