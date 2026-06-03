import type { ExportFormat, ExportScope, ParsedSession } from "./types.js";
import { formatDate, formatDuration } from "./utils.js";
import { renderSession } from "./render/index.js";

export function renderMergedReport(title: string, sessions: ParsedSession[], format: ExportFormat, scope: ExportScope): string {
  if (format === "json") {
    return `${JSON.stringify({
      title,
      generatedAt: new Date().toISOString(),
      sessions: sessions.map((session) => JSON.parse(renderSession(session, "json", scope)))
    }, null, 2)}\n`;
  }

  if (format === "html") {
    const body = sessions.map((session) => renderSession(session, "html", scope).replace(/^<!doctype html>[\s\S]*?<main>/i, "").replace(/<\/main>[\s\S]*$/i, "")).join("\n<hr>\n");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head><body><main>${body}</main></body></html>\n`;
  }

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`Generated: ${formatDate(new Date())}`);
  lines.push("");
  lines.push(`Sessions: ${sessions.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const session of sessions) {
    lines.push(renderSession(session, "md", scope).replace(/^# /, "## "));
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

export function renderTimelineReport(title: string, sessions: ParsedSession[], format: ExportFormat): string {
  const events = sessions
    .flatMap((session) => session.timeline.map((event) => ({ ...event, session })))
    .sort((a, b) => (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0));

  if (format === "json") {
    return `${JSON.stringify({
      title,
      generatedAt: new Date().toISOString(),
      events: events.map((event) => ({
        time: event.timestamp?.toISOString(),
        sessionId: event.session.info.id,
        sessionTitle: event.session.info.title,
        label: event.label,
        detail: event.detail
      }))
    }, null, 2)}\n`;
  }

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  for (const event of events) {
    const time = event.timestamp ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(event.timestamp) : "--:--";
    const detail = event.detail ? ` - ${event.detail}` : "";
    lines.push(`${time} ${event.label}${detail}`);
  }
  lines.push("");
  lines.push(`Duration: ${formatDuration(totalDurationMs(sessions))}`);
  lines.push("");

  if (format === "html") {
    const items = lines.slice(2).map((line) => `<p>${escapeHtml(line)}</p>`).join("");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><main><h1>${escapeHtml(title)}</h1>${items}</main></body></html>\n`;
  }

  return `${lines.join("\n").trim()}\n`;
}

function totalDurationMs(sessions: ParsedSession[]): number | undefined {
  const values = sessions.map((session) => session.statistics.durationMs).filter((value): value is number => typeof value === "number");
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
