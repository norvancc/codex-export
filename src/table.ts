import type { SessionInfo } from "./types.js";
import { formatShortDate, shortId } from "./utils.js";

const MIN_TABLE_WIDTH = 60;
const MIN_TITLE_WIDTH = 12;

interface Column {
  key: "id" | "updated" | "messages" | "tools" | "title";
  header: string;
  width: number;
  align?: "left" | "right";
}

export function renderSessionTable(sessions: SessionInfo[], terminalWidth = process.stdout.columns || 120): string {
  const width = Math.max(MIN_TABLE_WIDTH, terminalWidth);
  const columns = makeColumns(width);
  const lines = renderSessionTableHeader(width);

  for (const session of sessions) {
    lines.push(renderSessionTableRow(session, width));
  }

  lines.push(renderBorder(columns));
  return lines.join("\n");
}

export function renderSessionTableHeader(terminalWidth = process.stdout.columns || 120): string[] {
  const width = Math.max(MIN_TABLE_WIDTH, terminalWidth);
  const columns = makeColumns(width);
  return [
    renderBorder(columns),
    renderRow(columns, {
      id: "ID",
      updated: "Updated",
      messages: "Msgs",
      tools: "Tools",
      title: "Title"
    }),
    renderBorder(columns)
  ];
}

export function renderSessionTableRow(session: SessionInfo, terminalWidth = process.stdout.columns || 120): string {
  const width = Math.max(MIN_TABLE_WIDTH, terminalWidth);
  const columns = makeColumns(width);
  return renderRow(columns, {
    id: shortId(session.id),
    updated: formatShortDate(session.updatedAt),
    messages: String(session.messageCount),
    tools: String(session.toolCallCount),
    title: session.title
  });
}

function makeColumns(terminalWidth: number): Column[] {
  const fixedColumns: Column[] = [
    { key: "id", header: "ID", width: 10 },
    { key: "updated", header: "Updated", width: 18 },
    { key: "messages", header: "Msgs", width: 6, align: "right" },
    { key: "tools", header: "Tools", width: 6, align: "right" }
  ];

  const totalColumnCount = fixedColumns.length + 1;
  const overhead = (totalColumnCount * 2) + (totalColumnCount + 1);
  const fixedWidth = fixedColumns.reduce((sum, column) => sum + column.width, 0);
  const titleWidth = Math.max(MIN_TITLE_WIDTH, terminalWidth - fixedWidth - overhead);

  return [
    ...fixedColumns,
    { key: "title", header: "Title", width: titleWidth }
  ];
}

function renderBorder(columns: Column[]): string {
  return `+${columns.map((column) => "-".repeat(column.width + 2)).join("+")}+`;
}

function renderRow(columns: Column[], row: Record<Column["key"], string>): string {
  return `|${columns.map((column) => {
    const value = truncateDisplay(row[column.key], column.width);
    const padded = column.align === "right"
      ? padStartDisplay(value, column.width)
      : padEndDisplay(value, column.width);
    return ` ${padded} `;
  }).join("|")}|`;
}

function truncateDisplay(input: string, width: number): string {
  if (displayWidth(input) <= width) return input;
  if (width <= 3) return ".".repeat(width);

  const suffix = "...";
  let result = "";
  let used = 0;
  for (const char of input) {
    const charWidth = charDisplayWidth(char);
    if (used + charWidth > width - suffix.length) break;
    result += char;
    used += charWidth;
  }
  return `${result}${suffix}`;
}

function padEndDisplay(input: string, width: number): string {
  return input + " ".repeat(Math.max(0, width - displayWidth(input)));
}

function padStartDisplay(input: string, width: number): string {
  return " ".repeat(Math.max(0, width - displayWidth(input))) + input;
}

function displayWidth(input: string): number {
  let width = 0;
  for (const char of input) width += charDisplayWidth(char);
  return width;
}

function charDisplayWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code === 0) return 0;
  if (code < 32 || (code >= 0x7f && code < 0xa0)) return 0;
  if (isCombining(code)) return 0;
  if (isWide(code)) return 2;
  return 1;
}

function isCombining(code: number): boolean {
  return (code >= 0x0300 && code <= 0x036f)
    || (code >= 0x1ab0 && code <= 0x1aff)
    || (code >= 0x1dc0 && code <= 0x1dff)
    || (code >= 0xfe20 && code <= 0xfe2f);
}

function isWide(code: number): boolean {
  return (code >= 0x1100 && code <= 0x115f)
    || code === 0x2329
    || code === 0x232a
    || (code >= 0x2e80 && code <= 0xa4cf)
    || (code >= 0xac00 && code <= 0xd7a3)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xfe10 && code <= 0xfe19)
    || (code >= 0xfe30 && code <= 0xfe6f)
    || (code >= 0xff00 && code <= 0xff60)
    || (code >= 0xffe0 && code <= 0xffe6);
}
