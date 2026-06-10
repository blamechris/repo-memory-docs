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

- **Cache Engine** — hashes files (SHA-256), stores and invalidates summaries, ranks by access frequency, and garbage-collects stale entries. GC runs automatically on server startup, with age thresholds set in [[install-and-configuration#Garbage Collection|the `gc` config block]].
- **Indexer Pipeline** — discovers files (respecting `.gitignore`), summarizes them via the configured engine (regex by default, or tree-sitter ASTs with [[install-and-configuration#Summarizer|`"summarizer": "ast"`]]), extracts imports/exports, and detects changes through a diff-analyzer.
- **Dependency Graph** — in-memory adjacency maps backed by SQLite, powering [[tools-reference#get_dependency_graph|`get_dependency_graph`]]. Design notes: [[design/dependency-graph-design|Dependency Graph]].
- **Task Memory** — investigation-task CRUD plus exploration tracking and the unexplored frontier, powering the task tools. Design notes: [[design/task-memory-design|Task Memory]].
- **Telemetry** — token tracking with sampling, export, and retention, powering [[tools-reference#get_token_report|`get_token_report`]].
- **Session Manager** — cross-turn session persistence so investigations survive context-window resets.

## How the Cache Works

**First access (cache miss):** the agent calls [[tools-reference#get_file_summary|`get_file_summary`]]. The server reads the file, SHA-256 hashes it, extracts a summary via the configured summarizer (exports, imports, purpose, declarations, line count), stores the hash plus summary in SQLite, and returns the compact summary. No savings yet — the file had to be read. (The [[tools-reference#The repo-memory index CLI|`repo-memory index` CLI]] can pay this first-read cost ahead of time, e.g. as a git post-merge hook or CI step.)

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

Prewarm runs via the [[tools-reference#The repo-memory index CLI|`repo-memory index` CLI]] record no telemetry events (0.11.0+) — earlier versions logged a `cache_miss` per indexed file, which distorted agent-traffic hit-ratio stats. The report from [[tools-reference#get_token_report|`get_token_report`]] therefore reflects agent traffic only.

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

Summaries are extracted via regex analysis, or from tree-sitter parse trees when [[install-and-configuration#Summarizer|`"summarizer": "ast"`]] is set. All six language families below have AST support in `ast` mode, which adds semantic purpose lines derived from doc comments; regex stays as the universal fallback for other languages and unparseable files.

- **TypeScript / JavaScript** — exports, imports, declarations, purpose classification; AST mode adds JSDoc-derived purpose lines
- **Python** — functions, classes (incl. `async def`), `__all__`, `from`/`import` statements; AST mode adds docstring-derived purpose lines
- **Go** — exported names (uppercase), imports, type/func/var/const declarations; AST mode adds doc-comment purpose lines and grouped `var (…)` / `const (…)` support
- **Rust** — `pub` items, `use`/`mod` statements, structs/enums/traits/impls; AST mode adds `///` doc-comment purpose lines and `pub use` re-exports
- **Kotlin** (`.kt/.kts`, 0.11.0+) — AST mode only: public top-level `fun`/`class`/`object`/`interface`/`enum class`/`data class`/`val`/`var`/`typealias` (excluding `private`/`internal`), `import` paths, KDoc-derived purpose lines; regex mode gives only basic filename classification
- **Java** (0.11.0+) — AST mode only: public types and the public methods/fields of the public type, `import` statements (incl. `static` and wildcard), Javadoc-derived purpose lines; regex mode gives only basic filename classification

The dependency graph ([[tools-reference#get_related_files|`get_related_files`]], [[tools-reference#get_dependency_graph|`get_dependency_graph`]]) extracts imports for all six language families regardless of summarizer mode.

Config files (JSON, YAML, TOML) and other types get basic classification.

## Design Decisions

- **SQLite with WAL mode** — concurrent reads while writing; database at `.repo-memory/cache.db` in the target project.
- **SHA-256 hashing** — deterministic file comparison; unchanged hash means the cached summary is still valid.
- **POSIX-normalized paths** — all stored paths (cache keys, import edges, task files) use forward slashes regardless of platform, so lookups and prefix scoping (e.g. `search_by_purpose`'s `pathPrefix`) behave identically on Windows and Unix.
- **Per-key config validation** — an invalid value in `.repo-memory.json` is skipped with a warning while the valid keys still apply; only an unreadable or unparseable file falls back fully to defaults.
- **Regex-first summarization, AST opt-in** — the default engine is fast regex extraction of exports, imports, and declarations; `"summarizer": "ast"` swaps in tree-sitter (pure WASM, no native compilation) for exact exports and semantic purpose lines, with per-file regex fallback on parse errors. The AST spike exposed the regex engine's biggest accuracy hole — `export async function` declarations were invisible to its export pattern (15 of 35 files in repo-memory's own `src/`) — which has since been fixed in the regex engine too. See the [[design/ast-summarizer-design|AST summarizer design notes]].
- **ESM only** — `"type": "module"` with NodeNext resolution.
- **Cache correctness over performance** — never return stale data; when in doubt, re-read the file.
