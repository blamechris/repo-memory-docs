# repo-memory-docs

Living documentation for [repo-memory](https://github.com/blamechris/repo-memory) — an MCP (Model Context Protocol) server that gives AI coding agents persistent memory about a codebase, cutting token waste by caching file summaries and re-reading only files that actually changed.

Built with [Quartz 4](https://quartz.jzhao.xyz/) over an Obsidian vault (`content/`). Deployed to GitHub Pages and served at **https://www.blamechris.com/repo-memory-docs/**.

## Local development

```bash
npm ci
npx quartz build --serve   # preview at http://localhost:8080
```

## Deploy

Push to `main` — the Quartz deploy Action builds and publishes to the `gh-pages` branch automatically.

## Source of truth

The canonical docs and code live in the [main repo-memory repo](https://github.com/blamechris/repo-memory). This wiki mirrors them; see `CLAUDE.md` for the sync protocol.
