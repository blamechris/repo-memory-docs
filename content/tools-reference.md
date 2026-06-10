---
title: MCP Tools Reference
---

repo-memory exposes 13 MCP tools, organized into four **groups**. `navigation` and `summaries` are on by default — together they deliver the core "understand the repo without re-reading" loop. `tasks` and `telemetry` are off by default (each MCP tool adds ~100 tokens per turn to the system prompt, so the default surface stays lean); enable them via the `tools` block in `.repo-memory.json` (see [[install-and-configuration#Configuration File|configuration]]).

The cache-correctness rule applies across all tools: the server never returns stale data — if a file's SHA-256 hash has changed, a fresh summary is generated automatically. All stored and returned paths are POSIX-normalized (forward slashes), regardless of platform. Source: [github.com/blamechris/repo-memory](https://github.com/blamechris/repo-memory).

See also: [[agent-patterns|Agent Usage Patterns]] for how to combine these tools, and [[install-and-configuration|Install and Configuration]] to get them into Claude Code. Besides the MCP tools, the package ships one CLI subcommand for prewarming the cache — see [[tools-reference#The repo-memory index CLI|the `repo-memory index` CLI]] at the end of this page.

| Group | Tools | Default |
|-------|-------|---------|
| navigation | `get_project_map`, `get_related_files`, `get_dependency_graph`, `get_changed_files` | on |
| summaries | `get_file_summary`, `batch_file_summaries`, `search_by_purpose`, `force_reread`, `invalidate` | on (`"summaries": false` to disable) |
| tasks | `create_task`, `get_task_context`, `mark_explored` | off (`"tasks": true` to enable) |
| telemetry | `get_token_report` | off (`"telemetry": true` to enable) |

## `get_file_summary`

Returns a cached summary of a file. If the file has not changed since last read, returns the cached summary without re-reading.

**Input:**

```json
{ "path": "src/server.ts" }
```

**Output (cache hit):**

```json
{
  "path": "src/server.ts",
  "summary": {
    "purpose": "entry point",
    "exports": ["main"],
    "imports": ["@modelcontextprotocol/sdk/server/mcp.js", "zod"],
    "lineCount": 219,
    "topLevelDeclarations": ["server", "main"],
    "confidence": "high"
  },
  "fromCache": true,
  "cacheAge": 42,
  "suggestFullRead": false
}
```

- `suggestFullRead` is `true` when summary confidence is `"low"`, signalling the agent should read the full file for accuracy.
- `cacheAge` is in seconds since the cached entry was last validated; only present on cache hits. The debug fields earlier versions echoed back (`hash`, `reason`) were dropped in 0.13.0 — they cost tokens on every call and carried nothing an agent could act on.
- Generating a summary also persists the file's import edges, so the [[tools-reference#get_dependency_graph|dependency graph]] stays as fresh as the summary cache.
- Summary quality depends on the `summarizer` setting in `.repo-memory.json`: `"ast"` (default since 0.12.0) or `"regex"`. AST mode yields more accurate exports and a semantic `purpose` line naming the dominant symbols; files that fail to parse fall back to the regex engine automatically. See [[install-and-configuration#Summarizer|the summarizer config]].

## `batch_file_summaries`

Returns summaries for multiple files in a single call. Each file goes through the same cache-or-summarize flow as `get_file_summary`. Prefer this over many individual `get_file_summary` calls when exploring a set of related files.

**Input:**

```json
{ "paths": ["src/server.ts", "src/cache/store.ts", "src/missing.ts"] }
```

The output contains a `results` array (each entry shaped like a `get_file_summary` response), `totalFiles`, `cacheHits`, `cacheMisses`, and an `errors` array — a failing path (missing file, invalid path) lands in `errors` without failing the batch.

## `get_changed_files`

Returns files that have changed, been added, or been deleted since the last check.

**Input** — by last check, by ISO timestamp, or omit `since` to compare all files against cached hashes:

```json
{ "since": "last_check" }
```

**Output:**

```json
{
  "changed": ["src/tools/get-file-summary.ts"],
  "added": ["src/utils/new-helper.ts"],
  "deleted": ["src/old-module.ts"],
  "checkedAt": "2025-01-15T12:30:00.000Z"
}
```

- On first run (empty cache), all files appear in `added`.
- Running this tool updates the cached hashes, so the next call only shows changes since this call.
- When a file's hash changes, its now-stale summary is dropped (it regenerates on next access) and its import edges are re-extracted, so neither the summary cache nor the dependency graph can drift. Earlier versions had a serious bug here — the new hash was stored alongside the old summary, turning every later lookup into a confident stale hit; fixed in 0.13.0.

## `get_project_map`

Returns a structural overview: directory tree, entry points, and language breakdown. The output is deliberately compact — per-file entries carry only `name` and `purpose` (a directory's path is derivable from its nesting), and zero-byte `.gitkeep` placeholder files are omitted from the tree.

**Input:**

```json
{ "depth": 2 }
```

**Output:**

```json
{
  "tree": {
    "name": "repo-memory",
    "files": [{ "name": "server.ts", "purpose": "entry point" }],
    "children": [
      {
        "name": "cache",
        "files": [
          { "name": "hash.ts", "purpose": "utility" },
          { "name": "store.ts", "purpose": "data access" }
        ],
        "children": [],
        "fileCount": 5
      }
    ],
    "fileCount": 25
  },
  "entryPoints": ["src/server.ts"],
  "totalFiles": 25,
  "languageBreakdown": { ".ts": 22, ".json": 2, ".md": 1 }
}
```

- `project_root` is optional (0.13.0+) — it defaults to the server's working directory, like every other tool.
- `depth` defaults to 2 (0.13.0+) — enough to orient without dumping the whole tree (an unbounded map of a mid-size repo ran ~3,600 tokens). Pass a larger value for deeper structure.
- `entryPoints` lists files whose summarized purpose starts with `"entry point"`.
- Per-file confidence is available via `get_file_summary`; recency is covered by `get_changed_files`.

## `search_by_purpose`

Finds files by purpose/exports keywords — search by concept (e.g. "database", "auth", "validation") instead of grepping. Matches against each file's purpose, exports, top-level declarations, and path segments; only files that have been summarized before (via `get_file_summary`, `batch_file_summaries`, `force_reread`, or the [[tools-reference#The repo-memory index CLI|`index` prewarm CLI]]) are searchable.

Matching is word-boundary aware (0.14.0): identifiers are split on camelCase/snake_case/kebab-case boundaries, so `store` finds `CacheStore` as a whole word; a whole-word hit outranks a prefix hit, which outranks a bare substring; and terms shorter than 3 characters only count as whole identifier words (`id` finds `findUserById` but no longer matches inside `validation`). Path segments (extension excluded) participate at declaration weight, so `src/telemetry/tracker.ts` matches "telemetry" even when its summary text doesn't say the word.

**Input:**

```json
{ "query": "cache invalidation", "limit": 10, "pathPrefix": "src/cache" }
```

**Output:**

```json
{
  "results": [
    {
      "path": "src/cache/invalidation.ts",
      "purpose": "source",
      "exports": ["CacheInvalidator"],
      "confidence": "high"
    }
  ],
  "totalCached": 12,
  "scope": "src/cache"
}
```

**Parameters:**

- `query` (required): space-separated keywords. Purpose matches are weighted highest, then exports, then declarations.
- `limit` (optional): max results. Default 20.
- `pathPrefix` (optional): restrict results to files at or under this path (e.g. `"src/cache"`). Matched on a path boundary, so `"src/cache"` excludes `src/cache-utils.ts`.

- `totalCached` is the number of summarized files in scope (after `pathPrefix` filtering), not the number of matches. If it is 0, warm the cache with `repo-memory index` first.
- `scope` is present only when `pathPrefix` was given, echoing the normalized prefix.
- `exports` is capped at 5 entries per result; when capped, `exportsTruncated` carries the total export count. The `query` echo and per-result `matchedOn` field were dropped in 0.13.0.
- Matches are validated against disk before being served (0.13.0): a file that changed since it was summarized is re-summarized and re-scored, and a deleted file is evicted rather than returned — the never-stale rule applies to the discovery path too.
- Telemetry records one `summary_served` event per query (not per matched file), booking a conservative estimate of what one full-file read would have cost.

## `get_related_files`

Returns files related to a given file, ranked by relevance. Candidates come from direct imports/importers, transitive dependencies (depth 2), and same-directory files, then get scored by weighted signals — relationship type, dependency proximity to the query file, recency, task context, file type, and degree centrality (0.13.0 weights). Useful for deciding what else to look at when exploring a file. See [[design/relevance-ranking-design|the relevance-ranking design]] for the signal model and shipped weights.

**Input:**

```json
{ "path": "src/cache/store.ts", "limit": 5, "task_id": "550e8400-e29b-41d4-a716-446655440000" }
```

**Output:**

```json
{
  "path": "src/cache/store.ts",
  "relatedFiles": [
    { "path": "src/persistence/db.ts", "score": 0.82, "relationship": "imports" },
    { "path": "src/cache/invalidation.ts", "score": 0.74, "relationship": "imported-by" },
    { "path": "src/cache/gc.ts", "score": 0.61, "relationship": "same-directory" }
  ]
}
```

**Parameters:**

- `path` (required): file to find relations for.
- `limit` (optional): max results. Default 10.
- `task_id` (optional): a task whose explored/flagged files should influence ranking (unexplored files rank higher; flagged files get a boost).

`relationship` is one of `"imports"`, `"imported-by"`, `"transitive-dependency"`, or `"same-directory"`.

## `get_dependency_graph`

Returns dependency graph information as adjacency maps. Query a specific file's dependencies/dependents, or omit `path` for a whole-repo summary of the most connected files (large — prefer passing `path`). The graph is served from the persisted `imports` table with a freshness gate, so warm queries touch no project files; edge targets are real on-disk paths (0.13.0), so every path in the response can be followed with a read.

**Parameters:**

- `path` (optional): file to query. Omit only when you want the whole-repo summary.
- `direction` (optional): `"dependencies"`, `"dependents"`, or `"both"` (default `"both"`). `deps` is present when the direction includes dependencies; `dependents` when it includes dependents.
- `depth` (optional): max traversal depth for transitive queries.
- `symbol` (optional): filter edges by import specifier (e.g. `"UserService"`), returning only edges that import that symbol (as a `deps` adjacency map).
- `limit` (optional, no-path summary mode only): max files included in `deps`, ranked by connectivity. Default 50.

**Output (specific file):**

```json
{
  "deps": {
    "src/server.ts": [
      "src/tools/get-changed-files.ts",
      "src/tools/get-file-summary.ts",
      "src/tools/invalidate.ts"
    ]
  },
  "dependents": { "src/server.ts": [] },
  "stats": { "totalFiles": 4, "totalEdges": 3 }
}
```

**Output (whole-repo summary):**

```json
{
  "deps": {
    "src/cache/store.ts": ["src/persistence/db.ts", "src/types.ts"],
    "src/types.ts": []
  },
  "stats": {
    "totalFiles": 118,
    "totalEdges": 284,
    "mostConnected": [{ "path": "src/types.ts", "connections": 12 }]
  },
  "truncated": true
}
```

The adjacency-map shape replaced the old `nodes[]` + `edges[]` arrays in 0.13.0 — the array shape serialized every path three times, putting a no-path call at ~5,300 tokens; the same information as adjacency maps is less than half that. `stats.mostConnected` appears only in the no-path summary mode, where `stats` counts the whole graph and `truncated: true` flags that `deps` was capped by `limit`.

## `create_task`

Creates a new investigation task for tracking file exploration progress. Part of the `tasks` group (off by default — enable with `"tools": { "tasks": true }`).

**Input:**

```json
{ "name": "investigate auth flow" }
```

Returns an `id`, `name`, `state`, timestamps, `sessionId`, and `metadata`.

## `get_task_context`

Returns task state, explored files, and the unexplored frontier. With no `task_id`, returns a list of all tasks.

**Input (specific task):**

```json
{ "task_id": "550e8400-e29b-41d4-a716-446655440000" }
```

The output includes the task record, `exploredFiles` (with status and notes), and a `frontier` array of files not yet explored.

## `mark_explored`

Marks a file as explored for a task, with optional status and notes.

**Input:**

```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "path": "src/auth/login.ts",
  "status": "explored",
  "notes": "Main login handler, uses JWT tokens"
}
```

- `status` (optional): `"explored"`, `"skipped"`, or `"flagged"`. Default `"explored"`.
- `notes` (optional): free-text notes about the file.

## `get_token_report`

Returns aggregated token telemetry showing cache efficiency and token savings. Part of the `telemetry` group (off by default — enable with `"tools": { "telemetry": true }`).

**Parameters:**

- `period` (optional): `"session"`, `"all"`, or `"last_n_hours"`. Default `"all"`.
- `hours` (optional): hours to look back (only for `last_n_hours`).
- `session_id` (optional): session ID (only for `session` period).
- `include_diagnostics` (optional): include cache health diagnostics (entry counts, stale entries, database size) in the report.

**Output:**

```json
{
  "period": "last_n_hours",
  "totalEvents": 156,
  "cacheHits": 132,
  "cacheMisses": 24,
  "cacheHitRatio": 0.846,
  "estimatedTokensSaved": 482000,
  "topFiles": [{ "path": "src/server.ts", "accessCount": 12, "tokensEstimated": 8400 }],
  "eventBreakdown": { "cache_hit": 132, "cache_miss": 24 }
}
```

See [[architecture#Token Savings|how savings are calculated]] for the underlying token math. Note that [[tools-reference#The repo-memory index CLI|`repo-memory index`]] prewarm runs record no telemetry events (0.11.0+), so the report reflects agent traffic only.

## `force_reread`

Re-reads a file from disk, generates a fresh summary, and updates the cache. Use when you know a file changed or want guaranteed-fresh data — for example, just before modifying a file.

**Input:**

```json
{ "path": "src/cache/store.ts" }
```

## `invalidate`

Invalidates cached entries. Target a single file via `path`, or pass an empty object to clear the entire cache.

**Output (single file):**

```json
{ "invalidated": "src/cache/store.ts", "entriesRemoved": 1 }
```

**Output (all entries):**

```json
{ "invalidated": "all", "entriesRemoved": 47 }
```

## The `repo-memory index` CLI

Not an MCP tool, but part of the same package (0.10.0+). Running the `repo-memory` binary with no arguments starts the MCP server on stdio; `repo-memory index [projectRoot] [--quiet]` instead prewarms the summary cache and exits. The first time an agent touches a file it pays full price — the summary has to be generated — so this lets you pay that cost ahead of time (post-merge hook, CI step) and start the first session with cache hits.

```bash
repo-memory index            # index the current directory
repo-memory index /path/to/project
repo-memory index --quiet    # no output on success (for scripts/CI)
```

It scans the project, hashes every indexable file, and generates summaries for entries that are missing or stale. Unchanged files are left untouched, so it is cheap to run repeatedly. It reuses the standard summary path, so it respects `.repo-memory.json` (ignore patterns, `maxFiles`, [[install-and-configuration#Summarizer|summarizer mode]]); MCP server behavior is unchanged. Prewarm runs do not record telemetry events (0.11.0+) — earlier versions logged a `cache_miss` per file, distorting agent-traffic hit-ratio stats in [[tools-reference#get_token_report|`get_token_report`]].

**Output:**

```
$ repo-memory index
Indexed /path/to/project
  scanned:       128
  summarized:    126
  already fresh: 2
  skipped:       0
  elapsed:       0.42s
  cache db:      /path/to/project/.repo-memory/cache.db
```

**Parameters:**

- `projectRoot` (optional): directory to index. Default: current directory.
- `--quiet` / `-q`: print nothing on success.

Exits `0` on success, `1` on error (message on stderr).

To keep the cache warm automatically, run it from a git `post-merge` hook so every pull/merge re-indexes only what changed:

```sh
#!/bin/sh
# .git/hooks/post-merge (chmod +x)
(npx -y @blamechris/repo-memory index . --quiet >/dev/null 2>&1 &)
```

The subshell-and-background form keeps pulls fast; with `--quiet` the run is silent. Note `post-merge` does not fire on rebase pulls (`git pull --rebase`).
