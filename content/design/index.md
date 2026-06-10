---
title: Design Notes
---

Design spikes and data-model write-ups for repo-memory's bigger subsystems, ported from the repo's `docs/planning/` directory. These capture the reasoning at design time — schemas, algorithms, tradeoffs — and are kept as design history; where the shipped implementation diverged, each page notes it. Source: [github.com/blamechris/repo-memory](https://github.com/blamechris/repo-memory).

## Pages

- [[design/ast-summarizer-design|AST Summarizer]] — the tree-sitter (WASM) spike behind `"summarizer": "ast"`: dependency choice, accuracy and speed measurements, generation-tag cache invalidation, and the rollout from TS/JS to Python/Go/Rust and Kotlin/Java.
- [[design/task-memory-design|Task Memory Data Model]] — task lifecycle, the two-table schema, the computed frontier, and GC rules behind `create_task` / `get_task_context` / `mark_explored`.
- [[design/dependency-graph-design|Dependency Graph]] — SQLite adjacency-list storage, in-memory query patterns, incremental updates, and multi-language extensibility behind `get_dependency_graph`.
- [[design/relevance-ranking-design|Relevance Ranking]] — the weighted-signal scoring model (task proximity, dependency proximity, recency, file type, change frequency, name match) behind `get_related_files`.
- [[design/diff-aware-design|Diff-Aware Summary Updates]] — classifying changes as structural vs non-structural via `git diff` to skip unnecessary re-summarization; designed and deferred until scale warrants it.

See [[architecture|Architecture and Caching]] for how the shipped subsystems fit together, and the [[tools-reference|tools reference]] for the tools they power.
