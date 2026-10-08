# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

mongo-updown is an opinionated MongoDB migration tool, written in TypeScript: up/down migration
scripts, version-aware. **README.md is the spec for user-facing behavior** (CLI, config, migration
layout, execution order, phases, failure behavior, transactions) — read it before changing any of
that. This file only records implementation decisions the code doesn't make obvious.

## Architecture

- **Module boundaries** under `src/`: `cli/` (argv parsing + `init`/`up`/`down` commands),
  `config/` (load/validate the config file), `migrations/` (discover files on disk, load them,
  compute the ordered plan — the plan computation is a pure function, no I/O), `db/` (own the
  `MongoClient` connection and the state-tracking collection), `common/` (cross-cutting code;
  currently just the logger port, needed since `no-console` is a lint error).
- **Phase is optional identity**: a migration is `{ version, phase?, file }`. With `phases: false`,
  `phase` is omitted entirely — in refs and in stored state documents — never `null` or a sentinel.
  Every phase-dependent rule (the `--phase` requirement, the pre/post ordering guard) is a no-op
  when the phase is `undefined`.
- **`--phase` validation is split**: argv parsing runs before the config is loaded, so it only
  checks the value shape; whether `--phase` is required or forbidden is checked right after loading
  the config, before connecting.
- **Plan before run**: the full plan (including the phase ordering guard) is computed, and every
  planned migration is loaded, before any step runs — so a guard, import, or shape error runs
  nothing. If any planned migration is transactional, the server's transaction support is checked
  at the same point.
- **State is an append-only event log** (`{ version, phase?, file, direction, date }`, never
  updated or deleted). "Currently applied" is derived inside MongoDB by an aggregation pipeline
  (latest event per identity wins, `'down'` excluded) — never by fetching the log into the process.
- **Transactional steps** run in `client.withSession(s => s.withTransaction(...))`, and the state
  event is inserted with the same session so migration and record commit or abort together.
- **Parallel-operation guard**: the driver only marks a transaction started once the server replies
  to its first command, so concurrent operations on a session randomly fail with
  `ConflictingOperationInProgress` or happen to work. `connect` enables `monitorCommands`, and each
  transaction attempt tracks in-flight commands by `lsid`; any overlap throws a plain error (no
  `TransientTransactionError` label, so `withTransaction` doesn't retry it), making it deterministic.
- **Known limitation**: switching an existing project between `phases: true` and `false` makes all
  recorded history look pending. Documented as unsupported; no fix designed yet.
- **Logger port** (`#Common/logger`) has semantic methods (`info`, `step`, `success`, `error`), so
  commands say _what kind_ of message they emit and the implementation owns symbols/colors.
  `createConsoleLogger` takes an injectable `ChalkInstance` so tests can force color on/off.

## Commands

```shell
pnpm install          # install deps
pnpm run build         # build (tsc -p tsconfig.build.json, emits to ./dist)
pnpm run typecheck     # typecheck only (tsc --noEmit)
pnpm run lint          # lint (oxlint .)
pnpm run format        # format and write (oxfmt .)
pnpm run format:check  # check formatting without writing (oxfmt --check .)
pnpm test              # pretest boots docker-compose's local MongoDB, node:test runs test/**/*.spec.ts, posttest tears it down
```

CI runs `typecheck`, `lint`, `format:check`, and `test`.

## Toolchain

- **pnpm**, dependencies added with exact versions (`saveExact: true`), except `peerDependencies`
  (`mongodb`), which use ranges.
- **ESM (`"type": "module"`) + native Node type-stripping** runs `.ts` directly, with no build
  step for tests. Consequences: only erasable syntax (`erasableSyntaxOnly` — no enums or
  decorators), explicit `import type` (`verbatimModuleSyntax`).
- **Path aliases live in package.json `imports`**, not tsconfig `paths` (type-stripping never reads
  tsconfig). Each `#<Area>/*` alias maps `development` → `./src/<area>/*.ts` and `default` →
  `./dist/<area>/*.js`; add one whenever a new top-level `src/` area is introduced. Relative imports
  are a lint error — always import extensionless via the alias (e.g. `#Common/logger`).
- **Tests**: native `node:test` + `node:assert/strict`, run with `--conditions=development` so
  aliases resolve to `src/`. Integration tests hit a real single-node replica set (`rs0`, so
  transactions work) from `docker-compose.yml`, started/stopped by `test/setup.ts` /
  `test/teardown.ts` via `pretest`/`posttest`.

## Directives

Hard rules — follow these exactly, no exceptions:

- **Doc first** — before changing code, update the docs to describe the change. User-facing
  behavior goes in README.md only. CLAUDE.md gets only what a future session couldn't learn from
  README.md, the code, or config files: a non-obvious implementation decision and why, or a hard
  rule. Never restate README.md, copy config, or list function names here; prefer editing or
  replacing an existing bullet over adding one.
- **TDD** — when adding functionality, always start with tests and follow red/green flow.
- **Test coverage** — every source file must have a paired test with at least one invalid and one
  valid case, plus one case per branch or variant of the behavior.
- **context7 first** — for any library, framework, tool, or DSL syntax — JavaScript APIs, testing
  libraries, etc. — always use the context7 MCP server (`resolve-library-id` then `query-docs`)
  instead of guessing from training data. Never guess from memory.
- **Ask when uncertain** — if there's any doubt about intent, or multiple valid approaches exist, ask
  before proceeding; never guess at architectural decisions, design choices, or user preferences.
  Always ask through the interactive questions interface (the AskUserQuestion tool) instead of
  plain text, so the user can pick from options. Exception: commit-message approval (next rule).
- **Review commit messages** — always show the generated commit message and get explicit approval
  before running `git commit`. Never commit without that review. End the turn with the message in a
  code block, followed by short reply options (e.g. "commit" / "split" / edits), and let the user
  approve in chat. Don't call AskUserQuestion in that turn: in the VS Code extension, text written
  before a question prompt isn't shown, so the message would be hidden.
