---
title: Repo Memory Documentation
---

**repo-memory** is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that gives AI coding agents persistent, structured memory about a codebase. Every time an agent explores a project it re-reads files from scratch, burning tokens on code it has already seen — on a 200-file project that is roughly 43,000 tokens wasted per exploration pass. repo-memory caches compact file summaries, tracks changes via SHA-256 hashing, builds dependency graphs, remembers what has been explored across conversation turns, and measures the token savings. When a file has not changed, the agent gets the cached summary instead of the full file; when it has, a fresh summary is generated automatically so you never see stale data.

## Quick Links

- [[tools-reference|MCP Tools Reference]] — every tool the server exposes, with inputs and outputs
- [[architecture|Architecture and Caching]] — how the cache, indexer, and telemetry fit together
- [[install-and-configuration|Install and Configuration]] — getting set up with Claude Code or a global install
- [[agent-patterns|Agent Usage Patterns]] — recommended exploration patterns for agents
- [[developer-guide|Developer Guide]] — contributing, project structure, and conventions

## Key Facts

- **What it is:** an MCP server (stdio transport) that maintains a per-project cache of file summaries to cut token waste in agentic coding workflows.
- **Package:** `@blamechris/repo-memory` (npm). Storage lives in `.repo-memory/cache.db` (SQLite) in your project root.
- **Tech:** TypeScript, Node.js 20+, MCP SDK, SQLite via `better-sqlite3`. ESM only, MIT licensed.
- **Compression:** roughly a 3.6x compression ratio of full file versus summary, sustained across project sizes from 10 to 200 files.
- **Source of truth:** [github.com/blamechris/repo-memory](https://github.com/blamechris/repo-memory).

## The 13 Tools at a Glance

| Tool | What it does |
|------|--------------|
| `get_file_summary` | Cached file summary (exports, imports, purpose, declarations, line count) |
| `batch_file_summaries` | Summaries for multiple files in one call |
| `get_changed_files` | Files changed, added, or deleted since last check |
| `get_project_map` | Structural overview: tree, entry points, language breakdown |
| `search_by_purpose` | Find files by purpose/exports keywords |
| `get_related_files` | Related files ranked by relevance |
| `get_dependency_graph` | File dependency relationships |
| `create_task` | Start an investigation task |
| `get_task_context` | Task state, explored files, unexplored frontier |
| `mark_explored` | Mark a file explored/skipped/flagged with notes |
| `get_token_report` | Token usage and savings telemetry |
| `force_reread` | Force a fresh summary from disk |
| `invalidate` | Clear cache entries (single file or all) |

See the [[tools-reference|full tools reference]] for inputs, outputs, and parameters.
