---
title: Developer Guide
---

How to build, test, and contribute to repo-memory. Source of truth: [github.com/blamechris/repo-memory](https://github.com/blamechris/repo-memory).

## Prerequisites

- Node.js 20+
- npm

## Getting Started

```bash
git clone https://github.com/blamechris/repo-memory.git
cd repo-memory
npm install
```

## Commands

```bash
npm run build             # Compile TypeScript to dist/
npm run typecheck         # Type check without emitting
npm start                 # Run dist/server.js (build first)
npm test                  # Unit tests (vitest)
npm run test:integration  # Integration tests
npm run test:coverage     # Tests with coverage
npm run lint              # ESLint
npm run format            # Prettier
npm run benchmark         # Performance benchmarks
```

`npm run build` also vendors the tree-sitter grammar `.wasm` files into `dist/grammars/` (via `scripts/copy-grammars.mjs`), so the published package carries its own grammars for the AST summarizer; `tree-sitter-wasms` is only a devDependency.

## Project Structure

```
src/
  server.ts           # MCP server entry point, tool registration
  types.ts            # Shared type definitions (CacheEntry, FileSummary, ImportRef)
  config.ts           # Configuration loading (per-key validation of .repo-memory.json)
  tools/              # MCP tool handlers (one file per tool)
  cache/              # Cache engine
    hash.ts           #   SHA-256 file hashing
    store.ts          #   SQLite-backed cache store
    invalidation.ts   #   Cache invalidation logic
    ranking.ts        #   Access frequency ranking
    gc.ts             #   Garbage collection for stale entries
  indexer/            # File analysis pipeline
    scanner.ts        #   Project file discovery (respects .gitignore)
    summarize.ts      #   Summarizer dispatch (regex vs AST) + cache generation tag
    summarizer.ts     #   Regex-based file summarization
    ast-summarizer.ts #   Tree-sitter (WASM) summarization: TS/JS, Python, Go, Rust, Kotlin, Java
    smart-summarizer.ts # Enhanced summarization
    imports.ts        #   Import/export extraction
    diff-analyzer.ts  #   Change detection
    project-map.ts    #   Directory tree builder
  persistence/        # Database layer
    db.ts             #   SQLite connection and schema management
  graph/              # Dependency analysis
    dependency-graph.ts # In-memory adjacency maps
  memory/             # Session and task tracking
    session.ts        #   Cross-turn session persistence
    task.ts           #   Investigation task CRUD
  telemetry/          # Usage tracking (token savings estimation)
  utils/
    posix-path.ts     #   POSIX (forward-slash) path normalization for stored paths
    validate-path.ts  #   Path security validation
```

See [[architecture|Architecture and Caching]] for how these layers fit together, and the [[design/index|Design Notes]] for the design spikes behind the bigger subsystems.

## Testing

Tests use [vitest](https://vitest.dev/) and split into unit and integration:

```
tests/
  unit/         # Unit tests for individual modules
  integration/  # End-to-end MCP flow tests
  fixtures/     # Sample project files used by tests
  benchmarks/   # Performance benchmarks
```

- Place unit tests in `tests/unit/<module-name>.test.ts` and integration tests in `tests/integration/`.
- Use the fixture project in `tests/fixtures/sample-project/` for file-based tests.
- Each test file should be self-contained with its own setup/teardown.

## Code Conventions

- TypeScript strict mode, ES2022 target, NodeNext modules.
- ESM only (`"type": "module"`).
- Single quotes, trailing commas, 100-character line width.
- No `console.log` in production code — use structured output via MCP responses.
- Cache correctness over cache performance — never return stale data.
- Deterministic file hashing (SHA-256).
- Run `npm run lint` and `npm run format` before committing.

## Adding Tools Thoughtfully

Each MCP tool costs roughly 100 tokens per turn in the system prompt. Prefer enhancing existing tools with optional parameters over adding new tools. The rule of thumb: ROI = (frequency × savings) − (turns × overhead).

## Commit Conventions

Format: `type(scope): description`.

- **Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- **Scopes:** `server`, `cache`, `indexer`, `memory`, `graph`, `telemetry`, `infra`.

Examples:

```
feat(cache): add LRU eviction to cache store
fix(indexer): handle re-exports in import extraction
test(graph): add cycle detection test cases
```

## Pull Requests

1. Create a feature branch from `main`.
2. Make changes with appropriate tests.
3. Ensure all checks pass: `npm run typecheck && npm run lint && npm test && npm run build`.
4. Open a PR against `main` using the PR template.
5. PRs require passing CI (typecheck + lint + test + build). No force pushes to `main`.

## Reporting Issues

Use GitHub Issues with the provided templates. Include steps to reproduce, expected versus actual behavior, and your Node.js version and OS.
