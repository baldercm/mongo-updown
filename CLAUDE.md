# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Architecture is designed (see below) and implementation is underway. `src/` and `test/` are being
built out to match the module boundaries and decisions documented here.

## Intended purpose (from README.md)

mongo-updown is an opinionated MongoDB migration tool, written in TypeScript, featuring:

- up/down migration scripts
- version-aware migrations

CLI usage:

```shell
npm i -D mongo-updown mongodb
npx mongo-updown init
npx mongo-updown up <version> <file?> --phase <pre|post>
npx mongo-updown down <version> <file?> --phase <pre|post>
```

## Architecture

- **`up <version> <file?> --phase <pre|post>`** applies every pending migration of that phase up to
  and including `<version>`, in order; `down <version> <file?> --phase <pre|post>` rolls back everything
  of that phase applied from `<version>` upward, inclusive. `<file?>` narrows either command to a single
  migration file within the target version and phase. `--phase` is **required** (missing or any value
  other than `pre`/`post` throws a usage error) so a deploy pipeline can never run the wrong phase by
  accident; each run executes exactly one phase.
- **Deployment phases**: `pre` migrations run before the new app version is deployed (additive,
  backward-compatible changes), `post` migrations run after it (destructive/cleanup changes). The
  phase is part of a migration's identity — `MigrationRef` is `{ version, phase, file }`, so
  `1.2.0/pre/x.js` and `1.2.0/post/x.js` are distinct migrations.
- **Phase ordering guard**: `computeMigrationPlan` (`src/migrations/migration-plan.ts`) throws, listing
  the blocking migrations, when `up X --phase post` is requested while any `pre` migration ≤ X is still
  pending, or when `down X --phase pre` is requested while any `post` migration ≥ X is still applied.
  The guard applies even when `<file?>` is given, and since the plan is computed before anything runs,
  a guard failure runs nothing.
- **`--help`/`-h`** prints usage and exits 0; **`--version`/`-v`** prints the installed package
  version (read from `package.json` at runtime, resolved relative to `bin.ts`/`bin.js` so it works
  in both dev and the compiled `dist/` output) and exits 0. Recognized only as the first argument.
  Running with **no command at all** (`npx mongo-updown` alone) is treated the same as `--help`,
  printing usage and exiting 0, instead of throwing an "unknown command" error — an unrecognized
  command name (e.g. `npx mongo-updown frobnicate`) still throws.
- **Versions are semver strings** (`major.minor.patch`), compared with semver rules.
- **Migration layout**: `<migrationsDir>/<version>/<phase>/<filename>.js` — the version and phase are
  directory names, not part of the filename (e.g. `migrations/1.2.0/pre/add-user-index.js`). Discovery
  rejects (throws on) any `.js` file placed directly in a version directory and any subdirectory other
  than `pre`/`post`; non-`.js` files are ignored. Either phase directory may be absent. Migration files must
  already be compiled `.js`; mongo-updown does no TypeScript execution of user migrations, just a
  plain dynamic `import()`. Each file exports `up(ctx)` / `down(ctx)`, taking a single
  `MigrationContext` `{ db, client, session }`, and may export `transaction = true` (any non-boolean value is a load error).
- **State tracking**: a dedicated collection (default `mongo_updown_migrations`) is an
  append-only event log — documents are shaped `{ version, phase, file, direction, date }`
  (`direction: 'up' | 'down'`) and are never deleted or updated, so the full migration history is
  always recoverable. `recordMigrationUp`/`recordMigrationDown` (`src/db/migration-state-store.ts`)
  each just `insertOne` a new event with their respective direction; there is no delete path.
  `getAppliedMigrations` derives "currently applied" (used to diff against "on disk") via a
  `$sort`/`$group`(`$last`)/`$match` aggregation pipeline run inside MongoDB, rather than fetching
  the whole (ever-growing) event log into the process — it groups by `{ version, phase, file }`, keeps
  only the direction of each group's most recent event, and returns the ones whose latest direction
  is `'up'`. A migration rolled back and never reapplied has a `'down'` event as its latest and is
  therefore excluded.
- **Failure behavior**: `runMigrationCommand` (`src/cli/commands/run-migration-command.ts`) runs a
  plan sequentially and stops at the first throw, leaving earlier steps in that run applied/rolled
  back as they completed. For a non-transactional migration, recording state is a separate write
  after the migration function returns, so a crash or state-store failure in that window can
  leave a migration applied-but-unrecorded (or the reverse on rollback), and the next run will
  attempt it again. This is an accepted trade-off, not a bug: user migrations are expected to be
  safe to run twice.
- **Transactions are opt-in per migration** (`export const transaction = true`), never global,
  because MongoDB transactions need a replica set/sharded cluster and forbid most DDL (index
  creation on existing collections, drops, renames, `collMod`) and anything past the 60s
  `transactionLifetimeLimitSeconds`. A transactional step runs inside
  `client.withSession(s => s.withTransaction(...))`: the migration gets `session` in its context and
  `recordMigrationUp`/`recordMigrationDown` insert the state event with that same session, so the
  migration and its record commit or abort together. Non-transactional steps get `session: undefined`.
- **Parallel-operation guard**: the driver only marks a transaction as started once the server
  replies to its first command, so concurrent first operations (e.g. `Promise.all`) randomly fail
  with `ConflictingOperationInProgress`, while later ones happen to work. The driver documents this as
  unsupported. `connect` therefore enables `monitorCommands`, and each transaction attempt runs under
  `watchSessionConcurrency` (`src/db/session-concurrency-guard.ts`), which tracks in-flight commands
  whose `lsid` matches the migration's session. If any two overlap, the step throws a plain error
  naming the migration, even when the driver would have succeeded. That aborts the transaction, and
  since the error carries no `TransientTransactionError` label, `withTransaction` doesn't retry it.
- **Preflight**: before running any step, `runMigrationCommand` loads every planned migration (so an
  import/shape error in any planned file runs nothing) and, if any is transactional, checks
  `supportsTransactions` (`src/db/transaction-support.ts`, a pure function over the server's `hello`
  response: true when `setName` is set or `msg === 'isdbgrid'`), throwing a message that lists the
  transactional migrations when the server is standalone.
- **Config file** (`mongo-updown.config.js`, written by `init`, refuses to overwrite an existing
  one unless `--force`) never contains a raw connection string — `mongoUri` is
  `{ fromEnv: string } | { fromFile: string }`, resolved to the actual URI only right before
  connecting. This keeps the config file safe to commit; a `fromFile` secrets file must be
  gitignored.
- **MongoDB driver** (`mongodb`) is a `peerDependency` (`^7.0.0`), not bundled — the host project
  controls the installed driver version.
- **Module boundaries** under `src/`: `cli/` (argv parsing + `init`/`up`/`down` commands),
  `config/` (load/validate the config file), `migrations/` (discover files on disk, load them,
  compute the ordered plan to run — the plan computation is a pure function, no I/O), `db/` (own
  the `MongoClient` connection and the state-tracking collection), `common/` (shared types, error
  classes, and a logger port since `no-console` is a lint error).
- **Logger port** (`#Common/logger`) has four semantic methods — `info`, `step`, `success`,
  `error` — instead of a single generic log call, so command code states _what kind_ of message
  it's emitting and leaves symbol/color formatting entirely to the implementation. `consoleLogger`
  is the production implementation: it prefixes each level with a restrained symbol (`·` info, `▸`
  step, `✔` success, `✖` error) and colors the line via `chalk`, which auto-detects TTY/`NO_COLOR`
  support so piped/CI output degrades to plain text automatically. `createConsoleLogger(chalkInstance)`
  takes an injectable `ChalkInstance` (default: chalk's auto-detecting default export) so tests can
  force color on/off deterministically instead of depending on the test runner's TTY state.

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

`.github/workflows/ci.yml` runs `typecheck`, `lint`, `format:check`, and `test` (in that order) on
every push to `main` and every pull request, pinned to the same Node (`24.21.0`) and pnpm
(`11.10.0`) versions as `pnpm-workspace.yaml`/`.nvmrc`.

## Toolchain

- Package manager: **pnpm** (`pnpm-workspace.yaml` pins `nodeVersion: '24.21.0'`, `saveExact: true`). Node version is also pinned via `.nvmrc` (`24`). Dependencies are added with exact versions (see `typescript: "7.0.2"` in `package.json`, no `^`/`~`), except `peerDependencies`, which use ranges. `chalk` is the one runtime `dependency` (used by `#Common/logger`'s `consoleLogger`), pinned exact like everything else.
- Module system: **`"type": "module"`** (ESM) — required so native Node TypeScript type-stripping can execute `.ts` files directly (it strips types only, it does not convert module syntax), which is what lets `node:test` run `.spec.ts` files with no build step.
- Language: TypeScript, strict mode, target `ES2024`, `module: nodenext` (see `tsconfig.json`). Also sets `customConditions: ["development"]` (see Path aliases below), `erasableSyntaxOnly: true` (catches decorators/enums at typecheck time — decorators are intentionally unused; native type-stripping can't execute them), and `verbatimModuleSyntax: true` (forces explicit `import type`, matching oxfmt's import-sorting groups below). `tsconfig.build.json` extends it for compiling `src/**/*.ts` while excluding `**/*spec.ts`, emitting to `./dist`.
- Lint: `oxlint` (`.oxlintrc.json`) — notable non-default rules once code exists:
  - Relative imports (`./`, `../`), including same-folder siblings, are banned; use the `#`-prefixed path aliases (package.json `imports` field, see below) instead.
  - `no-console`, `typescript/no-explicit-any`, `typescript/no-floating-promises`, `typescript/no-misused-promises`, and `typescript/explicit-module-boundary-types` are errors.
  - `test/**` and `test/setup.ts`/`test/teardown.ts` have relaxed overrides (e.g. `no-restricted-imports` off for setup/teardown).
- Format: `oxfmt` (`.oxfmtrc.json`) — no semicolons, single quotes, 2-space indent, 120 print width, no trailing commas, and import sorting grouped as: builtins → externals → `#`-prefixed path-alias imports → relative imports → unknown.
- Test runner: native **`node:test`** (not Jest, despite what the scaffolding originally anticipated) — `describe`/`it`/`before`/`after` from `node:test`, assertions from `node:assert/strict`, no globals. Run as `node --conditions=development --test "test/**/*.spec.ts"`; `--conditions=development` is what makes the `#X/*` aliases resolve to `src/*.ts` (see below) instead of `dist/*.js`. Integration tests (`db/*`, migration loading) run against a real local MongoDB via `docker-compose.yml` — a single-node replica set (`rs0`, member host `localhost:27017`) so transactions work, started/stopped by `test/setup.ts`/`test/teardown.ts` through npm's `pretest`/`posttest` lifecycle scripts (`node:test` has no Jest-style `globalSetup`/`globalTeardown`).

### Path aliases

Aliases are defined as a **package.json `imports` field**, not `tsconfig.json` `paths` — native Node type-stripping doesn't read `tsconfig.json` at all, so `paths`-based aliases would typecheck but fail to resolve at runtime. Each alias is conditional so it resolves to source when running from `.ts` (dev/test, via `--conditions=development`) and to the compiled build otherwise (what a consumer running the published CLI actually executes):

```json
"imports": {
  "#Common/*":     { "development": "./src/common/*.ts",     "default": "./dist/common/*.js" },
  "#Cli/*":        { "development": "./src/cli/*.ts",        "default": "./dist/cli/*.js" },
  "#Config/*":     { "development": "./src/config/*.ts",     "default": "./dist/config/*.js" },
  "#Migrations/*": { "development": "./src/migrations/*.ts", "default": "./dist/migrations/*.js" },
  "#Db/*":         { "development": "./src/db/*.ts",         "default": "./dist/db/*.js" }
}
```

Import shared/common code via `#Common/*` (etc.) rather than a relative path — extensionless, e.g.
`import { X } from '#Common/errors'` (enforced by the `no-restricted-imports` oxlint rule above).
Add a further `#<Area>/*` alias here, following the same `development`/`default` pattern, whenever
a new top-level `src/` area is introduced.

## Directives

Hard rules — follow these exactly, no exceptions:

| Directive              | Detail                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Doc first              | Always start updating README.md or CLAUDE.md file                                                                                                                                                                                         |
| TDD                    | When adding functionality, always start with tests and follow red/green flow.                                                                                                                                                             |
| Test coverage          | Every source file must have a paired test with at least one invalid and one valid case and cover existing variants.                                                                                                                       |
| context7 first         | For any library, framework, tool, or DSL syntax — JavaScript APIs, testing libraries, etc. — always use the context7 MCP server (`resolve-library-id` then `query-docs`) instead of guessing from training data. Never guess from memory. |
| Ask when uncertain     | If there's any doubt about intent, or multiple valid approaches exist, ask before proceeding. Never guess at architectural decisions, design choices, or user preferences.                                                                |
| Ask via interactive UI | Whenever asking the user anything, always use the interactive questions interface (e.g. the AskUserQuestion tool) instead of asking in plain text, so the user can pick from options.                                                     |
| Review commit messages | Always show the generated commit message and get explicit approval before running `git commit`. Never commit without that review.                                                                                                         |
