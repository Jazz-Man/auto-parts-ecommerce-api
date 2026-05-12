# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Auto parts e-commerce API built with NestJS 11 + TypeScript. Early-stage project — currently scaffolded with the default NestJS starter structure.

## Commands

```bash
bun install                  # Install dependencies
bun run start:dev            # Dev server with watch (port from PORT env var, default 3001)
bun run build                # Compile to dist/
bun run start:prod           # Run compiled output

bun run lint                 # Biome check with --unsafe --fix
bunx biome check --fix       # Biome check without --unsafe

bun run test                 # Unit tests (Jest via ts-jest)
bun run test:watch           # Tests in watch mode
bun run test:cov             # Coverage report
bun run test:e2e             # E2E tests (test/*.e2e-spec.ts)
bun run test -- path/to.spec.ts   # Single test file
```

## Tooling

- **Runtime/Package Manager**: Bun (lockfile: `bun.lock`)
- **Linting/Formatting**: Biome v2 (`biome.json`) — single quotes, no semicolons, 2-space indent, 80 char line width
- **Testing**: Jest 30 + ts-jest 29 — unit tests colocated as `*.spec.ts`, e2e tests in `test/`
- **TypeScript**: ES2023 target, nodenext module resolution, strict null checks enabled, `noImplicitAny` off

## Code Analysis Workflow

Always use the LSP tool (`lsp-code-analysis` skill) for reading and exploring `.ts`/`.js` files. LSP is the primary tool for symbol lookup, type info, references, and code navigation.

- **Symbol lookup** (definition, references, type info): LSP first — never grep for symbols
- **File structure** (list functions/classes): `documentSymbol` — not manual scan
- **Non-code files** (JSON, YAML, MD, config): `Read` tool as usual
- **Text search** (string literals, comments, patterns): `Grep` tool — only for non-symbol content
- **Bash**: for commands only (test, build, git) — never for text processing (grep, cat, sed, awk)

## Architecture

Standard NestJS modular structure. Entry point: `src/main.ts` → `AppModule`.

- `src/` — application source, root dir for Jest
- `test/` — e2e tests with separate `jest-e2e.json` config
- `dist/` — compiled output (gitignored)

When adding features, use NestJS CLI to generate modules/controllers/services:
```bash
bunx nest g module <name>
bunx nest g controller <name>
bunx nest g service <name>
```
