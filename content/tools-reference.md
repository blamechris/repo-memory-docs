---
title: MCP Tools Reference
---

repo-memory exposes 13 MCP tools, organized into four **groups**. `navigation` and `summaries` are on by default — together they deliver the core "understand the repo without re-reading" loop. `tasks` and `telemetry` are off by default (each MCP tool adds ~100 tokens per turn to the system prompt, so the default surface stays lean); enable them via the `tools` block in `.repo-memory.json` (see [[install-and-configuration#Configuration File|configuration]]).

The cache-correctness rule applies across all tools: the server never returns stale data — if a file's SHA-256 hash has changed, a fresh summary is generated automatically. All stored and returned paths are POSIX-normalized (forward slashes), regardless of platform. Source: [github.com/blamechris/repo-memory](https://github.com/blamechris/repo-memory).

See also: [[agent-patterns|Agent Usage Patterns]] for how to combine these tools, and [[install-and-configuration|Install and Configuration]] to get them into Claude Code.

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
  "hash": "a1b2c3d4e5f6...",
  "summary": {
    "purpose": "entry point",
    "exports": ["main"],
    "imports": ["@modelcontextprotocol/sdk/server/mcp.js", "zod"],
    "lineCount": 219,
    "topLevelDeclarations": ["server", "main"],
    "confidence": "high"
  },
  "fromCache": true,
  "reason": "cache_hit: hash unchanged",
  "cacheAge": 42,
  "suggestFullRead": false
}
```

- `suggestFullRead` is `true` when summary confidence is `"low"`, signalling the agent should read the full file for accuracy.
- `cacheAge` is in seconds since last check, or `null` if no prior cache entry exists.

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

## `get_project_map`

Returns a structural overview: directory tree, entry points, and language breakdown.

**Input:**

```json
{ "project_root": "/absolute/path/to/project", "depth": 2 }
```

- `depth` limits how deep the tree is traversed; omit for full depth.
- `entryPoints` lists files whose summarized purpose is `"entry point"`.

## `search_by_purpose`

Finds files by purpose/exports keywords — search by concept (e.g. "database", "auth", "validation") instead of grepping. Matches against each file's purpose, exports, and top-level declarations; only files that have been summarized before (via `get_file_summary`, `batch_file_summaries`, or `force_reread`) are searchable. Matched files count as `summary_served` in telemetry.

**Input:**

```json
{ "query": "cache invalidation", "limit": 10, "pathPrefix": "src/cache" }
```

**Output:**

```json
{
  "query": "cache invalidation",
  "results": [
    {
      "path": "src/cache/invalidation.ts",
      "purpose": "source",
      "matchedOn": ["exports", "declarations"],
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

`totalCached` is the number of summarized files in scope (after `pathPrefix` filtering), not the number of matches. `scope` is present only when `pathPrefix` was given, echoing the normalized prefix.

## `get_related_files`

Returns files related to a given file, ranked by relevance. Candidates come from direct imports/importers, transitive dependencies (depth 2), and same-directory files, then get scored by ranking signals (dependency proximity, recency, file type, task context, change frequency). Useful for deciding what else to look at when exploring a file. See [[design/relevance-ranking-design|the relevance-ranking design]] for the signal model.

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

Returns dependency graph information. Query a specific file's dependencies/dependents, or omit `path` for a full-graph summary of the most connected files.

**Parameters:**

- `path` (optional): file to query. Omit for full graph summary.
- `direction` (optional): `"dependencies"`, `"dependents"`, or `"both"` (default `"both"`).
- `depth` (optional): max traversal depth for transitive queries.
- `symbol` (optional): filter edges by import specifier (e.g. `"UserService"`), returning only edges that import that symbol.

**Output:**

```json
{
  "nodes": ["src/server.ts", "src/tools/get-file-summary.ts"],
  "edges": [{ "from": "src/server.ts", "to": "src/tools/get-file-summary.ts" }],
  "stats": {
    "totalFiles": 4,
    "totalEdges": 3,
    "mostConnected": [{ "path": "src/types.ts", "connections": 12 }]
  }
}
```

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

See [[architecture#Token Savings|how savings are calculated]] for the underlying token math.

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
