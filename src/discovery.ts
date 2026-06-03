import fs from "node:fs/promises";
import fg from "fast-glob";
import type { SessionInfo } from "./types.js";
import { readSessionInfo } from "./parser.js";
import { expandHome } from "./utils.js";

export const DEFAULT_SESSION_DIR = "~/.codex/sessions";

export interface DiscoverOptions {
  sessionDir?: string;
}

export async function discoverSessionFiles(options: DiscoverOptions = {}): Promise<string[]> {
  const cwd = expandHome(options.sessionDir ?? DEFAULT_SESSION_DIR);
  try {
    await fs.access(cwd);
  } catch {
    return [];
  }
  return fg("**/*.jsonl", {
    cwd,
    absolute: true,
    onlyFiles: true,
    dot: true
  });
}

export async function discoverSessions(options: DiscoverOptions = {}): Promise<SessionInfo[]> {
  const files = await discoverSessionFiles(options);
  const sessions: SessionInfo[] = [];

  await Promise.all(files.map(async (file) => {
    try {
      sessions.push(await readSessionInfo(file));
    } catch {
      // Corrupt or partially written sessions should not break listing.
    }
  }));

  return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export function findSessionById(sessions: SessionInfo[], id: string): SessionInfo | undefined {
  return sessions.find((session) => session.id === id || session.id.startsWith(id));
}
