---
title: Dependency Graph — Data Model and Query Patterns
---

Design for the dependency graph that powers [[tools-reference#get_dependency_graph|`get_dependency_graph`]] and feeds the [[design/relevance-ranking-design|relevance-ranking]] signals. Stored paths in `imports` are POSIX-normalized in the shipped implementation (see [[architecture#Design Decisions|design decisions]]).

> [!note] Shipped implementation (0.13.0)
> The design below proposed persisting edges and rebuilding the in-memory graph from the table. What originally shipped diverged in a costly way: the persisted table was written but never read — both graph tools re-read every project file per call and rewrote the whole `imports` table as a side effect of a read. The 2026-06 [[design/agent-search-audit|search-efficiency audit]] made this its unanimous headline finding, and 0.13.0 closed the loop:
>
> - **Write path:** edges are persisted whenever a summary is generated (`get_file_summary`, batch, prewarm, `get_changed_files` re-extraction), inside a transaction (delete-then-insert per source file).
> - **Read path:** graph queries load the stored edges, prune entries for deleted files, and stat-gate the rest — only files whose mtime is newer than their last check (minus a 2-second safety window for coarse filesystem timestamps) get re-hashed, and only actual hash changes get re-read. A warm query touches no project files and writes nothing.
> - **Resolution:** relative import targets are resolved to real on-disk paths at extraction time (`./store.js` probes to `src/cache/store.ts`, `index.*` resolution included); bare specifiers are external by definition and are not persisted. This killed the phantom-path class of bugs — `getDependents` misses, one-hop traversal dead-ends, `vitest`/`fs` in `mostConnected`.
> - **One extension list** shared by `get_dependency_graph` and `get_related_files`, so language coverage can't drift between them again.

## Storage

SQLite adjacency list in the existing `cache.db`. Each import edge is a row in an `imports` table. On server startup, the full graph is rebuilt in memory from this table for fast traversal.

### Schema (Migration v2)

```sql
CREATE TABLE imports (
  source      TEXT NOT NULL,   -- file that contains the import
  target      TEXT NOT NULL,   -- resolved import target (project-relative path or bare specifier)
  specifiers  TEXT NOT NULL,   -- JSON array of imported names, e.g. '["Foo","Bar"]'
  import_type TEXT NOT NULL,   -- 'static' | 'dynamic' | 're-export'
  PRIMARY KEY (source, target, import_type)
);

CREATE INDEX idx_imports_target ON imports (target);
```

The composite primary key allows a file to import the same target via different mechanisms (e.g. a static import and a re-export) while preventing duplicates.

## Query Patterns

| Function | Description |
|---|---|
| `getDependencies(path)` | Direct outgoing edges (what does this file import?) |
| `getDependents(path)` | Direct incoming edges (what files import this one?) |
| `getTransitiveDependencies(path, maxDepth?)` | BFS/DFS over outgoing edges up to `maxDepth` (default: unbounded) |
| `getTransitiveDependents(path, maxDepth?)` | BFS/DFS over incoming edges up to `maxDepth` (default: unbounded) |
| `getMostConnected(limit)` | Files ranked by in-degree + out-degree; surfaces hub modules |

Direct lookups hit the in-memory adjacency map (two maps: `outgoing` and `incoming`). Transitive queries use iterative BFS with a visited set to handle cycles.

## Update Strategy

**Incremental.** When a file changes (detected by hash mismatch during scan):

1. `DELETE FROM imports WHERE source = ?` — remove stale outgoing edges.
2. Run `extractImports(filePath, contents, projectRoot)` on the new contents.
3. `INSERT INTO imports` for each returned `ImportRef`.
4. Update the in-memory adjacency maps accordingly.

No full rebuild is needed. Bulk initial indexing uses the same per-file path inside a transaction for performance.

## Multi-Language Extensibility

Import extraction is regex-based and per-language. `extractImports` started with TypeScript/JavaScript (ESM imports, CJS require, re-exports, dynamic imports) and has since grown extractors for Python, Go, Rust, and (0.11.0) Kotlin/Java — all six language families, regardless of summarizer mode. New languages can be supported by:

1. Adding a new extractor function with the same `(filePath, contents, projectRoot) => ImportRef[]` signature.
2. Dispatching on file extension in the scanner.

The storage layer and query patterns are language-agnostic — they operate on `ImportRef` edges regardless of source language.
