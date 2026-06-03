import type { ExportFormat, ExportScope, ParsedSession } from "../types.js";
import { renderHtml } from "./html.js";
import { renderJson } from "./json.js";
import { renderMarkdown } from "./markdown.js";

export function renderSession(session: ParsedSession, format: ExportFormat, scope: ExportScope): string {
  const options = {
    clean: scope === "clean",
    includeTools: scope === "with-tools" || scope === "with-tool-results",
    includeToolResults: scope === "with-tool-results"
  };

  if (format === "html") return renderHtml(session, options);
  if (format === "json") return renderJson(session, options);
  return renderMarkdown(session, options);
}

export function extensionForFormat(format: ExportFormat): string {
  if (format === "html") return "html";
  if (format === "json") return "json";
  return "md";
}
