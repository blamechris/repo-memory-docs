---
title: Install and Configuration
---

repo-memory ships as the npm package `@blamechris/repo-memory` and runs as an MCP server over stdio. It needs Node.js 20+. The current published version is 0.17.0; if you pin versions, note that 0.7.0 was never published — the npm registry goes straight from 0.6.0 to 0.8.0. Source: [github.com/blamechris/repo-memory](https://github.com/blamechris/repo-memory).

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

## Prewarming the Cache

The first time an agent touches a file it pays full price — the summary has to be generated. The `repo-memory index` subcommand (0.10.0+) pays that cost ahead of time, so the first session starts with cache hits. A post-merge hook or a CI step are the natural homes:

```bash
repo-memory index            # index the current directory
repo-memory index /path/to/project
repo-memory index --quiet    # no output on success (for scripts/CI)
```

Only missing or stale entries are re-summarized; unchanged files are left untouched, so it is cheap to run repeatedly. It reuses the standard summary path, so it respects `.repo-memory.json` (ignore patterns, `maxFiles`, [[install-and-configuration#Summarizer|summarizer mode]]). Prewarm runs do not record telemetry events (0.11.0+), so bulk indexing never distorts [[tools-reference#get_token_report|`get_token_report`]] hit-ratio stats. MCP server behavior is unchanged — running `repo-memory` with no arguments still starts the server on stdio.

To automate it, drop a git `post-merge` hook in the project so every pull/merge re-indexes only what changed:

```sh
#!/bin/sh
# .git/hooks/post-merge (chmod +x)
(npx -y @blamechris/repo-memory index . --quiet >/dev/null 2>&1 &)
```

The subshell-and-background form keeps pulls fast; with `--quiet` the run is silent. Note `post-merge` does not fire on rebase pulls (`git pull --rebase`). See [[tools-reference#The repo-memory index CLI|the CLI reference]] for full details.

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
  "summarizer": "regex",
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

### Summarizer

`summarizer` selects the summary engine: `"ast"` (default since 0.12.0) or `"regex"`.

AST mode parses files with tree-sitter compiled to WASM — there are no native dependencies to build. It produces accurate exports and declarations plus a semantic `purpose` line naming the dominant symbols (e.g. `class CacheStore (9 methods)` instead of the bare word `source`) — which is exactly what [[tools-reference#search_by_purpose|`search_by_purpose`]] matches against. The grammar `.wasm` files are vendored into the package at build time, so nothing extra is resolved or downloaded at install time.

AST mode covers TypeScript/JavaScript, Python, Go, Rust, Kotlin (`.kt`/`.kts`), and Java. Other languages, unsupported extensions, and files with parse errors fall back to the regex summarizer automatically, per file — AST mode can never do worse than regex, which is why it graduated from opt-in to default after a release of soak time. For Kotlin and Java the difference matters more than for the rest: the regex engine never had extraction logic for them (fallback yields only basic filename classification), so AST mode is the first engine to actually parse them. One known Kotlin limit: the grammar rejects single-line class bodies (`class C { fun f() {} }`), which sends such files to the generic-classification fallback. See [[architecture#Language Support|language support]] for what each language's AST mode extracts.

Switching modes regenerates cached summaries lazily on next access; file hashes and timestamps are untouched, so change detection keeps working. The generation tag that drives this is monotonic (0.13.0): when several processes share one cache at different package versions — a long-running MCP server plus an `npx` post-merge hook, say — the older process serves read-through without clearing or re-tagging, so version skew can no longer cause regenerate-storms. See the [[design/ast-summarizer-design|AST summarizer design notes]] for the measurements and tradeoffs behind the feature.

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
