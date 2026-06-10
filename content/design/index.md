---
title: Design Notes
---

Design spikes and data-model write-ups for repo-memory's bigger subsystems, ported from the repo's `docs/planning/` directory. These capture the reasoning at design time — schemas, algorithms, tradeoffs — and are kept as design history; where the shipped implementation diverged, each page notes it. Source: [github.com/blamechris/repo-memory](https://github.com/blamechris/repo-memory).

## Pages

- [[design/ast-summarizer-design|AST Summarizer]] — the tree-sitter (WASM) spike behind `"summarizer": "ast"`: dependency choice, accuracy and speed measurements, generation-tag cache invalidation, and the rollout from TS/JS to Python/Go/Rust and Kotlin/Java.
- [[design/task-memory-design|Task Memory Data Model]] — task lifecycle, the two-table schema, the computed frontier, and GC rules behind `create_task` / `get_task_context` / `mark_explored`.
- [[design/dependency-graph-design|Dependency Graph]] — SQLite adjacency-list storage, in-memory query patterns, incremental updates, and multi-language extensibility behind `get_dependency_graph`.
- [[design/relevance-ranking-design|Relevance Ranking]] — the weighted-signal scoring model behind `get_related_files`, including the 0.13.0 rework (relationship and centrality signals; the shipped weights).
- [[design/diff-aware-design|Diff-Aware Summary Updates]] — classifying changes as structural vs non-structural via `git diff` to skip unnecessary re-summarization; designed and deferred until scale warrants it.
- [[design/agent-search-audit|Agent Search Efficiency Audit]] — the six-lens June 2026 audit of the retrieval path: the cache-poisoning bug, the write-only graph, the token-shaping pass, and the explicit non-goals (embeddings, query caching, new tools; FTS5 deferred). Everything in its action plan shipped in 0.13.0.

See [[architecture|Architecture and Caching]] for how the shipped subsystems fit together, and the [[tools-reference|tools reference]] for the tools they power.
