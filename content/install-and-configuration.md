---
title: Install and Configuration
---

repo-memory ships as the npm package `@blamechris/repo-memory` and runs as an MCP server over stdio. It needs Node.js 20+. Source: [github.com/blamechris/repo-memory](https://github.com/blamechris/repo-memory).

## Quick Start with Claude Code

Add repo-memory to your Claude Code MCP settings. No global install is required — Claude Code can run it directly via `npx`.

**Project-level** (recommended) — create or edit `.claude/settings.json` in your project root:

```json
{
  "mcpServers": {
    "repo-memory": {
      "command": "npx",
      "args": ["-y", "@blamechris/repo-memory"]
    }
  }
}
```

**User-level** — the same block in `~/.claude/settings.json` enables it for every project.

## Global Install

```bash
npm install -g @blamechris/repo-memory
repo-memory  # starts the MCP server on stdio
```

With a global install, configure the server by command name:

```json
{
  "mcpServers": {
    "repo-memory": {
      "command": "repo-memory"
    }
  }
}
```

## Verifying It Works

Restart Claude Code after changing settings, then ask: "What tools do you have from repo-memory?" It should list `get_file_summary`, `get_changed_files`, `get_project_map`, and the rest. See the [[tools-reference|full tools reference]].

## Storage

repo-memory stores its cache in `.repo-memory/cache.db` (a SQLite file) in your project root. Add it to `.gitignore`:

```
.repo-memory/
```

## Configuration File

Create `.repo-memory.json` in your project root to customize behavior:

```json
{
  "ignore": ["dist", "node_modules", "*.generated.ts"],
  "maxFiles": 5000,
  "gc": {
    "cacheMaxAgeDays": 30,
    "taskMaxAgeDays": 30,
    "telemetryMaxAgeDays": 90
  },
  "tools": {
    "tasks": true,
    "telemetry": true
  }
}
```

- `ignore` — glob patterns to exclude from scanning and summarization.
- `maxFiles` — upper bound on files indexed.

### Tool Groups

The `tools` block toggles tool groups. `navigation` and `summaries` are on by default (set `"summaries": false` to drop the summary tools); `tasks` and `telemetry` are off by default (set them to `true` to enable). See the [[tools-reference|tools reference]] for which tools belong to which group.

### Garbage Collection

The `gc` block controls garbage collection, which runs automatically on server startup:

- `gc.cacheMaxAgeDays` — remove cache entries not checked in N days (default: 30).
- `gc.taskMaxAgeDays` — remove completed/archived tasks not updated in N days (default: 30).
- `gc.telemetryMaxAgeDays` — remove telemetry events older than N days (default: 90).

GC also removes cache entries for deleted files and orphaned import records, regardless of age.

### Validation

Config validation is per-key: an invalid value is skipped with a warning on stderr while the remaining valid keys still apply. Only a file that cannot be read or parsed as JSON falls back entirely to built-in defaults.

## Teaching Your Agent to Use It

Add a section like this to your project's `CLAUDE.md` so the agent prefers summaries over full reads:

- **Always try `get_file_summary` before reading a file** — it returns exports, imports, purpose, and line count in roughly 50 tokens versus ~800 for the full file.
- If a summary returns `suggestFullRead: true`, read the full file instead.
- Use `get_changed_files` at the start of work to see what changed; skip unchanged files.
- Prefer `batch_file_summaries` over multiple individual calls.
- Use `search_by_purpose` to find files by concept instead of grepping (pass `pathPrefix` to scope it to a directory), and `get_dependency_graph` to trace imports.
- Call `get_token_report` at the end of a session to report savings (requires enabling the `telemetry` tool group).

See [[agent-patterns|Agent Usage Patterns]] for the full set of recommended flows.

## Troubleshooting

- **Tools not appearing** — restart Claude Code after editing settings; confirm Node.js 20+ with `node --version`; try `npx @blamechris/repo-memory` manually (it should start and wait for input).
- **Permission errors** — ensure the project directory is writable for the `.repo-memory/` database.
- **Stale cache** — use the [[tools-reference#invalidate|`invalidate`]] tool to clear all cached data, or delete `.repo-memory/cache.db` directly.
