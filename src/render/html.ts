import type { ParsedSession } from "../types.js";
import { formatDate, formatDuration } from "../utils.js";
import { cleanConversationText, cleanToolOutput } from "../content.js";

interface HtmlOptions {
  includeTools: boolean;
  includeToolResults: boolean;
  clean: boolean;
}

export function renderHtml(session: ParsedSession, options: HtmlOptions): string {
  const title = escapeHtml(session.info.title || "Codex Session");
  const conversation = session.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => `
      <section class="message ${message.role}">
        <h3>${escapeHtml(capitalize(message.role))}</h3>
        <pre>${escapeHtml(options.clean ? cleanConversationText(message.content) : message.content)}</pre>
      </section>`)
    .join("\n");

  const tools = options.includeTools ? `
    <h2>Tool Calls</h2>
    ${session.toolCalls.length === 0 ? "<p>No tool calls were recorded.</p>" : session.toolCalls.map((call) => `
      <section class="tool">
        <h3>${escapeHtml(call.name === "exec_command" ? "Bash" : call.name)}</h3>
        ${call.cwd ? `<p><strong>Working directory:</strong> <code>${escapeHtml(call.cwd)}</code></p>` : ""}
        ${call.command ? `<pre><code>${escapeHtml(call.command)}</code></pre>` : `<pre><code>${escapeHtml(JSON.stringify(call.arguments ?? {}, null, 2))}</code></pre>`}
        ${options.includeToolResults && call.result ? `<h4>Result</h4><pre>${escapeHtml(cleanToolOutput(call.result.output || [call.result.stdout, call.result.stderr].filter(Boolean).join("\n\n")))}</pre>` : ""}
      </section>`).join("\n")}
  ` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; --border: #d0d7de; --muted: #57606a; --bg: #ffffff; --code: #f6f8fa; }
    @media (prefers-color-scheme: dark) { :root { --border: #30363d; --muted: #8b949e; --bg: #0d1117; --code: #161b22; } }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); line-height: 1.55; }
    main { max-width: 980px; margin: 0 auto; padding: 40px 24px; }
    h1 { font-size: 2rem; margin: 0 0 16px; }
    h2 { border-top: 1px solid var(--border); padding-top: 28px; margin-top: 36px; }
    .meta, .stats { color: var(--muted); }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px 20px; }
    .message, .tool { border: 1px solid var(--border); border-radius: 8px; padding: 18px; margin: 16px 0; }
    .message h3, .tool h3 { margin-top: 0; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--code); border-radius: 6px; padding: 14px; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p class="meta">Session ID: ${escapeHtml(session.info.id)}<br>Created: ${escapeHtml(formatDate(session.info.createdAt))}<br>Updated: ${escapeHtml(formatDate(session.info.updatedAt))}</p>
    <h2>Summary</h2>
    <p><strong>Objective:</strong> ${escapeHtml(session.summary.objective)}</p>
    <p><strong>Final outcome:</strong> ${escapeHtml(session.summary.finalOutcome)}</p>
    <h3>Key Decisions</h3>
    <ul>${session.summary.keyDecisions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h3>Problems Encountered</h3>
    <ul>${session.summary.problemsEncountered.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h3>Next Actions</h3>
    <ul>${session.summary.nextActions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h2>Statistics</h2>
    <div class="stats">
      <div>Messages: ${session.statistics.messages}</div>
      <div>User Messages: ${session.statistics.userMessages}</div>
      <div>Assistant Messages: ${session.statistics.assistantMessages}</div>
      <div>Tool Calls: ${session.statistics.toolCalls}</div>
      <div>Duration: ${escapeHtml(formatDuration(session.statistics.durationMs))}</div>
      <div>Files Modified: ${session.statistics.filesModified}</div>
      <div>Commands Executed: ${session.statistics.commandsExecuted}</div>
    </div>
    <h2>Conversation</h2>
    ${conversation}
    ${tools}
  </main>
</body>
</html>
`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function capitalize(input: string): string {
  return input.slice(0, 1).toUpperCase() + input.slice(1);
}
