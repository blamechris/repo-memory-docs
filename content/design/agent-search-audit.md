---
title: Agent Search Efficiency — Audit and Outcomes
---

A six-lens audit (June 2026) of the retrieval path — `search_by_purpose`, `get_related_files`, `get_dependency_graph`, `get_project_map`, and the ranking behind them — prompted by the question "what search tech should we add?" Six candidate ideas from the wild were evaluated: FTS5/BM25, embeddings, a persisted dependency graph, a symbol index, query-result caching, and token-budget shaping. The full reports live in the repo under `docs/audit-results/agent-search-efficiency/`; everything in the action plan shipped in 0.13.0.

## The Verdict

**2.6 / 5 — the feature set was the right shape; the plumbing between its own pieces was never connected, and one bug actively poisoned the cache.** The panel's answer to "what should we add?" was overwhelmingly *connect what exists, then shrink what it says*. The trendy candidates targeted a millisecond-scale non-problem (search measured 1–3 ms even at 2,000 files), while the measured problems were a staleness bug, a write-only graph, a ranking that output constants, and orientation tools costing 3–5k tokens per call.

## The Lenses

| Lens | Focus | Key contribution |
|---|---|---|
| Skeptic | Claims vs reality | Measured everything: 1–3 ms search at max scale; all ranking results tied at 0.325; phantom `.js` paths |
| Builder | Implementability | Verified FTS5 ships in better-sqlite3; found the two hidden prerequisites (import resolution, tokenization) |
| Guardian | Safety / staleness | Found the critical `get_changed_files` cache-poisoning bug; 10 testable invariants |
| Minimalist | YAGNI | "This is a cache for your cache" — the fix is net-negative LOC; 5 things not to build |
| Protocol | MCP token economics | Measured response sizes: no-path graph = 5.3k tokens, map = 3.6k; a standard exploration sequence could drop 3× |
| Historian | Prior art | repo-memory = "Aider's repo-map as an MCP server"; embeddings = Cody's documented retreat; nobody rebuilds an index per query |

## Consensus Findings → What Shipped (0.13.0)

1. **The persisted dependency graph existed, was never read, and the rebuild corrupted the table it ignored** (unanimous). Both graph tools re-read every project file per call and rewrote the whole `imports` table as a side effect of a read; the table held 0 rows in this repo's own cache. *Shipped:* the stored graph is the read path with a stat/hash freshness gate; edges are written from the summary write path; warm queries touch no project files. Net LOC negative. See [[design/dependency-graph-design|the dependency-graph notes]].
2. **Import-target resolution was the prerequisite for everything graph-shaped.** Stored targets kept specifier extensions (`./store.js` → phantom `src/cache/store.js`) and bare module names, so related-files results pointed at paths that don't exist and traversal dead-ended at one hop. *Shipped:* targets resolve to real on-disk paths at extraction; externals are tagged and excluded.
3. **`get_changed_files` poisoned the cache** — it stored the *new* hash alongside the *old* summary, turning every later lookup into a confident stale hit and defeating the hash check from inside. *Shipped first, as the critical fix:* a summary is only kept under the hash it was computed from.
4. **The scarce resource is tokens, not milliseconds.** *Shipped:* adjacency-map graph responses (−54%), depth-2 default project map, debug-field deletions (`hash`, `reason`, `matchedOn`, `query` echo), exports cap with explicit truncation, and tool-description rewrites so the tools win the selection contest against grep. The standard exploration sequence dropped from ~5,160 to ~1,640 tokens.
5. **The 5-signal ranking didn't rank** — one live signal in the default path; every top result tied at 0.325. *Shipped:* relationship and centrality signals, query-file proximity anchoring, dead signals deleted. See [[design/relevance-ranking-design#Shipped Weights (0.13.0)|the shipped weights]].
6. **Telemetry booked phantom savings** — `summary_served` was recorded per matched file, inflating "tokens saved" by up to the result limit. *Shipped:* one event per query with a realistic one-file-read counterfactual, best-effort on read paths. The ROI metric gates future features, so it must not lie.

Concurrency hardening rode along: monotonic generation tags, atomic clear+tag, `BEGIN IMMEDIATE` migrations, busy timeouts — the real multi-process workflows (long-running server + post-merge hooks at mixed versions) hit all of these.

## Explicit Non-Goals

Recorded so they don't get re-litigated each time they trend:

- **Embeddings / semantic search** — the industry's documented dead end for this use case (Cody's 2023–24 retreat; grep-first agent stances); disproportionate infrastructure for a single-user offline tool over one-line purposes, with an inherent staleness window.
- **Query-result caching** — protects a measured 1 ms computation while creating exactly the invalidation surface the project's first invariant forbids. "A cache for your cache."
- **New search MCP tools** — every tool costs ~100 tokens per turn in the system prompt; enhance existing tools with optional params instead.
- **Deep per-symbol index** — grep and LSPs own definition lookup; a third copy of the data invites a third staleness story.
- **FTS5/BM25** — *deferred*, not rejected: the only genuinely contested candidate. It replaces a measured 1 ms scan, and BM25 normalization means little over one-line near-uniform documents — but the lexical-survivor lineage argument stands. Revisit only with telemetry evidence of bad-ranking queries. The endorsed alternative — word-boundary scoring with a short-term noise guard and identifier tokenization — shipped in 0.14.0. As of 0.17.0 that evidence is actually captured: a query matching nothing records a `search_miss`, and `repo-memory report` surfaces the failed queries (`topMissedQueries`) — so the FTS5 decision can be made on a real list of unsatisfied searches rather than inferred from silence.

See [[architecture|Architecture and Caching]] for how the post-audit pieces fit together.
