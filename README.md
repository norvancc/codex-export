# codex-export

`codex-export` exports OpenAI Codex CLI sessions from `~/.codex/sessions` into readable Markdown, HTML, or JSON.

It is designed for engineering worklogs, retrospectives, GitHub discussions, Notion or Feishu docs, internal reports, and long-term archives of AI-assisted development.

## Features

- Interactive terminal UI with fuzzy session search, arrow navigation, pagination, and latest-first sorting
- Command mode for scripts and CI workflows
- Markdown, HTML, and JSON output
- Clean conversation, full conversation, tool-call, and tool-result scopes
- Automatic session discovery from `~/.codex/sessions/**/*.jsonl`
- Secret redaction for API keys, bearer tokens, authorization headers, AWS credentials, and common `.env` values
- Session statistics and heuristic AI-worklog summary
- Batch exports, daily reports, weekly reports, and timeline reports

## Install

```bash
npm install
npm run build
npm link
```

Node.js 20 or newer is required.

## Interactive Usage

```bash
codex-export
```

The interactive flow asks for:

1. Session
2. Export format
3. Content scope
4. Output location

## Command Usage

```bash
codex-export --list
codex-export --last --output report.md
codex-export --id SESSION_ID --format html --output report.html
codex-export --file session.jsonl --format json --with-tool-results
codex-export --last --full --output full-session.md
codex-export --all --output exports
codex-export --daily --output daily.md
codex-export --weekly --with-tools --output weekly.md
codex-export --timeline --output timeline.md
```

## Content Scopes

- `--clean`: user and assistant conversation with internal metadata and noisy output removed
- default command mode: same as `--clean`
- `--full`: fuller user and assistant conversation with secrets redacted
- `--with-tools`: conversation plus tool calls and commands
- `--with-tool-results`: conversation plus tool calls and sanitized tool results

Interactive mode also exposes "Full Conversation"; the current parser still excludes system and developer instructions from exports to avoid leaking internal prompt context.

## Output Formats

Markdown is the default:

```bash
codex-export --last --format md --output docs/codex-session.md
```

HTML:

```bash
codex-export --last --format html --output docs/codex-session.html
```

JSON:

```bash
codex-export --last --format json --with-tool-results --output docs/codex-session.json
```

## Development

```bash
npm install
npm run typecheck
npm test
```

The tests use Node's built-in test runner and import the compiled ESM output from `dist`.

## Publish to npm

1. Create an npm access token with publish permission.
2. In GitHub repo settings, add `NPM_TOKEN` in **Settings → Secrets and variables → Actions**.
3. Ensure package name/version in `package.json` are ready.
4. Publish from local:

```bash
npm run prepublishOnly
npm run publish:npm
```

5. Or publish from GitHub by creating a Release (triggers `.github/workflows/publish-npm.yml`).

## Example

See [examples/session.sample.jsonl](examples/session.sample.jsonl) for a minimal Codex session fixture.
