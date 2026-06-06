---
title: Agent Usage Patterns
---

Recommended patterns for AI agents using repo-memory. These reduce token usage and improve investigation efficiency by leaning on cached summaries instead of full file reads. See the [[tools-reference|tools reference]] for tool details. Source: [github.com/blamechris/repo-memory](https://github.com/blamechris/repo-memory).

## First-Visit Pattern

When meeting a new codebase, start with the structural overview before diving into individual files.

1. Call `get_project_map` for the directory tree, entry points, and language breakdown.
2. Identify entry points and key modules from the map.
3. Call `get_file_summary` for each entry point to understand the top-level architecture.
4. Follow imports from entry points to understand the dependency flow.

Instead of reading every file (potentially thousands of tokens), you get structured summaries of only the files that matter — a 200-line file summary is roughly 50 tokens versus ~800 for the full file.

## Investigation Pattern

When investigating a feature or bug, use task memory to track progress and avoid re-exploring files.

1. Call `create_task` with a descriptive name.
2. Use `get_dependency_graph` to find related files.
3. Call `get_file_summary` for each candidate.
4. Call `mark_explored` after examining each file, with notes about findings.
5. Call `get_task_context` to see the frontier of unexplored files.
6. Repeat until the investigation is complete.

Task memory persists across conversation turns. If the conversation is interrupted or the context window fills, the agent resumes by checking `get_task_context` to see what is already explored.

## Change Awareness Pattern

At the start of each turn (or after the user makes edits), check what changed before doing any work.

1. Call `get_changed_files` to detect modifications.
2. Only call `get_file_summary` for files that actually changed.
3. Skip unchanged files — their cached summaries are still valid.

In a typical session only 1-5 files change between turns. Checking hashes is fast and avoids re-reading the 95% of files that did not change.

## When to Bypass the Cache

The cache is optimized for token savings, but sometimes you need the full file.

**`suggestFullRead` flag** — when `get_file_summary` returns `suggestFullRead: true`, summary confidence is low. This happens with unusual syntax, files the regex summarizer cannot parse, or non-standard modules. Read the full file directly.

**`force_reread` for critical files** — use it when you are about to modify a file and need guaranteed-fresh data, when a summary seems wrong, or when external tools may have modified files outside the cache's view.

**Read the full file** even with a valid cache when you need exact implementation details, control flow inside functions, or to match the file's exact style.

## Token Budget Management

Use `get_token_report` to monitor and prove cache efficiency — at the end of a session to report savings, or mid-session to spot files accessed repeatedly.

- **High hit ratio (> 0.8)** — the cache is working well; most files are served from cache.
- **Low hit ratio (< 0.5)** — many first-time reads or frequently changing files; normal early in a session.
- **Top files with high access counts** — hotspot files; read them fully once and rely on the summary afterward.

## Pattern Combinations

- **New session:** Change Awareness, then First-Visit (for new files), then Investigation.
- **Continuing work:** Change Awareness, then `get_task_context` to resume, then Investigation.
- **Code review:** Change Awareness, then `get_file_summary` per changed file, then `get_dependency_graph` to check impact.
- **Refactoring:** First-Visit, then Investigation to find all usage sites, then Change Awareness to verify.
