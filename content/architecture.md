---
title: Architecture and Caching
---

repo-memory is an MCP server over stdio with a layered design. Each layer is a focused module; the persistence layer underneath is SQLite in WAL mode, stored at `.repo-memory/cache.db` in the target project root. Source: [github.com/blamechris/repo-memory](https://github.com/blamechris/repo-memory).

## Layers

```
MCP Server (stdio transport)
├── Cache Engine (hash, store, invalidation, ranking, GC)
├── Indexer Pipeline (scanner, summarizer, imports, diff-analyzer)
├── Dependency Graph (in-memory adjacency maps backed by SQLite)
├── Task Memory (CRUD, exploration tracking, frontier)
├── Telemetry (token tracking, sampling, export, retention)
├── Session Manager (cross-turn persistence)
└── Persistence Layer (SQLite with WAL mode)
```

- **Cache Engine** — hashes files (SHA-256), stores and invalidates summaries, ranks by access frequency, and garbage-collects stale entries.
- **Indexer Pipeline** — discovers files (respecting `.gitignore`), summarizes them via regex, extracts imports/exports, and detects changes through a diff-analyzer.
- **Dependency Graph** — in-memory adjacency maps backed by SQLite, powering [[tools-reference#get_dependency_graph|`get_dependency_graph`]].
- **Task Memory** — investigation-task CRUD plus exploration tracking and the unexplored frontier, powering the task tools.
- **Telemetry** — token tracking with sampling, export, and retention, powering [[tools-reference#get_token_report|`get_token_report`]].
- **Session Manager** — cross-turn session persistence so investigations survive context-window resets.

## How the Cache Works

**First access (cache miss):** the agent calls [[tools-reference#get_file_summary|`get_file_summary`]]. The server reads the file, SHA-256 hashes it, extracts a summary via regex (exports, imports, purpose, declarations, line count), stores the hash plus summary in SQLite, and returns the compact summary. No savings yet — the file had to be read.

**Subsequent access (cache hit):** the server re-reads and hashes the file; the hash matches the stored value, so it returns the cached summary without re-parsing. The savings — full-file tokens minus summary tokens — are logged.

**When files change:** the hash no longer matches, so a fresh summary is generated automatically. You never get stale data. The savings compound because an agent typically touches the same files 3-5 times per session: the first pass pays full price, every later hit returns a small summary.

## Token Savings

Telemetry records every cache interaction so savings can be measured exactly. Token estimates use the standard heuristic of about 4 characters per token, which closely matches major tokenizers (cl100k_base, o200k_base). For each cache hit:

```
tokensSaved = ceil(rawFileChars / 4) - ceil(summaryJsonChars / 4)
```

| Event | When | Tokens recorded |
|-------|------|-----------------|
| `cache_hit` | Summary served from cache (hash unchanged) | Tokens saved (raw file minus summary) |
| `cache_miss` | File changed or first access | 0 (no savings on first read) |
| `force_reread` | Explicit re-read requested | Raw file token count |
| `invalidation` | Cache entry cleared | — |
| `summary_served` | File matched via `search_by_purpose` | Estimated raw file tokens |

## Performance

Benchmarks on synthetic TypeScript projects with realistic imports and class structures show a sustained ~3.6x compression ratio and sub-millisecond per-file cached reads:

| Scenario | Files | Raw Size | Summary Size | Compression | Tokens Saved | Speed |
|----------|-------|----------|--------------|-------------|--------------|-------|
| Explore project | 10 | 11.7 KB | 3.3 KB | 3.6x | ~2,100 | 3.7 ms/file |
| Explore project | 50 | 58.0 KB | 16.2 KB | 3.6x | ~10,700 | 0.7 ms/file |
| Explore project | 100 | 116.1 KB | 32.3 KB | 3.6x | ~21,500 | 0.4 ms/file |
| Explore project | 200 | 233.4 KB | 65.7 KB | 3.6x | ~42,900 | 0.3 ms/file |

Run them yourself with `npm run benchmark`.

## Language Support

Summaries are extracted via regex analysis (no AST parsing — fast, trading some accuracy for speed):

- **TypeScript / JavaScript** — exports, imports, declarations, purpose classification
- **Python** — functions, classes, `__all__`, `from`/`import` statements
- **Go** — exported names (uppercase), imports, type/func/var/const declarations
- **Rust** — `pub` items, `use`/`mod` statements, structs/enums/traits/impls

Config files (JSON, YAML, TOML) and other types get basic classification.

## Design Decisions

- **SQLite with WAL mode** — concurrent reads while writing; database at `.repo-memory/cache.db` in the target project.
- **SHA-256 hashing** — deterministic file comparison; unchanged hash means the cached summary is still valid.
- **Regex-based summarization** — no AST required; fast extraction of exports, imports, and declarations.
- **ESM only** — `"type": "module"` with NodeNext resolution.
- **Cache correctness over performance** — never return stale data; when in doubt, re-read the file.
