# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Architecture is designed (see below) and implementation is underway. `src/` and `test/` are being
built out to match the module boundaries and decisions documented here.

## Purpose

mongo-updown is an opinionated MongoDB migration tool, written in TypeScript: up/down migration
scripts, version-aware. See README.md for the CLI usage and user-facing behavior.

## Architecture

- **`up <version> <file?> [--phase <pre|post>]`** applies every pending migration (of that phase, if
  phases are enabled) up to and including `<version>`, in order; `down <version> <file?> [--phase
<pre|post>]` rolls back everything (of that phase) applied from `<version>` upward, inclusive.
  `<file?>` narrows either command to a single migration file within the target version (and phase).
  Whether `--phase` is required depends on the project's config: `phases: true` requires it (missing
  or any value other than `pre`/`post` throws a usage error) so a deploy pipeline can never run the
  wrong phase by accident, while `phases: false` forbids it (given anyway throws a usage error) since
  there's no phase to select. `parseCliArgs` runs before the config file is loaded, so it only checks
  the value shape; the phases-vs-`--phase` requiredness check lives in `runMigrationCommand`, right
  after `loadConfig`, before any network connection. Each run executes exactly one phase (or, in
  phaseless mode, the entire flat set).
- **Deployment phases** (only meaningful when the config has `phases: true`): `pre` migrations run
  before the new app version is deployed (additive, backward-compatible changes), `post` migrations
  run after it (destructive/cleanup changes). The phase is part of a migration's identity —
  `MigrationRef` is `{ version, phase?, file }`, so `1.2.0/pre/x.js` and `1.2.0/post/x.js` are distinct
  migrations. With `phases: false`, `MigrationRef.phase` is omitted entirely (never `null`, never a
  sentinel) — identity is just `{ version, file }`.
- **Phase ordering guard**: `computeMigrationPlan` throws, listing the blocking migrations, when
  `up X --phase post` is requested while any `pre` migration ≤ X is still pending, or when
  `down X --phase pre` is requested while any `post` migration ≥ X is still applied. The guard applies
  even when `<file?>` is given, and since the plan is computed before anything runs, a guard failure
  runs nothing. It is a no-op when `options.phase` is `undefined` — there's no ordering concept
  without phases.
- **`--help`/`-h`** and **`--version`/`-v`** are recognized only as the first argument and exit 0.
  Running with no command at all is treated like `--help`; an unrecognized command name still throws.
- **Versions are strict `major.minor.patch` strings** (no `v` prefix, pre-release, or build
  metadata), compared numerically. Every subdirectory of `migrationsDir` must parse as one, or
  discovery throws.
- **Execution order**: `computeMigrationPlan` sorts by semver version, then by filename
  (`localeCompare`), ascending for `up`; `down` is the exact reverse (both descending). Filenames
  are the only ordering mechanism inside a version (and phase) — no manifest, no timestamps.
- **Migration layout** depends on the config's `phases` field, passed into `discoverMigrations` as
  `{ phases: boolean }`:
  - `phases: true`: `<migrationsDir>/<version>/<phase>/<filename>.js` — the version and phase are
    directory names, not part of the filename. Discovery rejects (throws on) any `.js` file placed
    directly in a version directory and any subdirectory other than `pre`/`post`; non-`.js` files are
    ignored. Either phase directory may be absent.
  - `phases: false`: `<migrationsDir>/<version>/<filename>.js`. Discovery rejects (throws on) **any**
    subdirectory found there, including one literally named `pre` or `post` (e.g. a leftover from
    switching modes); non-`.js` files are still ignored.
  - Migration files must already be compiled `.js`; mongo-updown does no TypeScript execution of
    user migrations, just a plain dynamic `import()`. Each file exports `up(ctx)` / `down(ctx)`,
    taking a single `MigrationContext` `{ db, client, session }`, and may export `transaction = true`
    (any non-boolean value is a load error). `loadMigration` accepts these as named exports or as
    properties of a `default` export object (so CJS `exports.up`, ESM `export const up`, and
    `export default { up, down }` all work).
- **State tracking**: a dedicated collection (default `mongo_updown_migrations`) is an
  append-only event log — documents are shaped `{ version, phase?, file, direction, date }`
  (`direction: 'up' | 'down'`) and are never deleted or updated, so the full migration history is
  always recoverable. When `phase` is absent (phaseless migrations), it is genuinely omitted from
  the stored document, never written as `null`. "Currently applied" is derived by
  `getAppliedMigrations` with an aggregation pipeline run inside MongoDB (not by fetching the
  ever-growing log into the process): the latest event per `{ version, phase, file }` wins, and a
  migration whose latest event is `'down'` is excluded. A missing `phase` groups like `null` but is
  still omitted from the result. **Known limitation**: because `phase` is part of the identity,
  switching an existing project between `phases: true` and `phases: false` makes all recorded
  history look pending (the plan filters applied migrations by `phase`). Documented as unsupported
  in README.md; a fix (e.g. a guard against mixed-mode history) hasn't been designed yet.
- **Failure behavior**: `runMigrationCommand` runs a plan sequentially and stops at the first throw,
  leaving earlier steps in that run applied/rolled back as they completed. For a non-transactional
  migration, recording state is a separate write after the migration function returns, so a crash or
  state-store failure in that window can leave a migration applied-but-unrecorded (or the reverse on
  rollback), and the next run will attempt it again. This is an accepted trade-off, not a bug: user
  migrations are expected to be safe to run twice.
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
  `watchSessionConcurrency`, which tracks in-flight commands whose `lsid` matches the migration's
  session. If any two overlap, the step throws a plain error naming the migration, even when the
  driver would have succeeded. That aborts the transaction, and since the error carries no
  `TransientTransactionError` label, `withTransaction` doesn't retry it.
- **Preflight**: before running any step, `runMigrationCommand` loads every planned migration (so an
  import/shape error in any planned file runs nothing) and, if any is transactional, checks
  `deploymentSupportsTransactions` (runs `hello`, then delegates to the pure `supportsTransactions`:
  true when `setName` is set or `msg === 'isdbgrid'`), throwing a message that lists the
  transactional migrations when the server is standalone.
- **Config file** (`mongo-updown.config.js`, written by `init`, refuses to overwrite an existing
  one unless `--force`) never contains a raw connection string — `mongoUri` is
  `{ fromEnv: string } | { fromFile: string }`, resolved to the actual URI only right before
  connecting. This keeps the config file safe to commit; a `fromFile` secrets file must be
  gitignored. `phases: boolean` is **required** — `isMongoUpdownConfig` rejects a config missing it
  or where it isn't a boolean; there is no implicit default anywhere in the schema or loader.
  `init --phases <true|false>` (default `true`) only controls what the template scaffolds, not a
  schema fallback. `init` writes `export default` or `module.exports` depending on the host
  project's `package.json` `type` (`detectHostModuleType`; missing/unreadable means CommonJS). The
  config is loaded from the current working directory, and relative `migrationsDir`/`fromFile`
  paths resolve from there.
- **Database name is required in the URI**: `connect` rejects a connection string with no database
  path, because the driver would otherwise silently fall back to `test` and run migrations (and
  record state) there.
- **MongoDB driver** (`mongodb`) is a `peerDependency` (`^7.0.0`), not bundled — the host project
  controls the installed driver version.
- **Module boundaries** under `src/`: `cli/` (argv parsing + `init`/`up`/`down` commands),
  `config/` (load/validate the config file), `migrations/` (discover files on disk, load them,
  compute the ordered plan to run — the plan computation is a pure function, no I/O), `db/` (own
  the `MongoClient` connection and the state-tracking collection), `common/` (cross-cutting code;
  currently just the logger port, needed since `no-console` is a lint error).
- **Logger port** (`#Common/logger`) has four semantic methods — `info`, `step`, `success`,
  `error` — so command code states _what kind_ of message it's emitting and leaves symbol/color
  formatting to the implementation (`consoleLogger`, built on `chalk`). `createConsoleLogger` takes
  an injectable `ChalkInstance` so tests can force color on/off instead of depending on the test
  runner's TTY state.

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

CI (`.github/workflows/ci.yml`) runs `typecheck`, `lint`, `format:check`, and `test` on every push
to `main` and every pull request.

## Toolchain

- Package manager: **pnpm**. Node is pinned to `24.21.0` in `pnpm-workspace.yaml` (`.nvmrc` only
  says `24`); the pnpm version is pinned only in `.github/workflows/ci.yml`. Dependencies are added with exact versions (`saveExact: true`, no `^`/`~`),
  except `peerDependencies`, which use ranges. `chalk` is the one runtime `dependency`.
- Module system: **`"type": "module"`** (ESM) — required so native Node TypeScript type-stripping can execute `.ts` files directly (it strips types only, it does not convert module syntax), which is what lets `node:test` run `.spec.ts` files with no build step.
- Language: TypeScript, strict mode, `module: nodenext`. `erasableSyntaxOnly: true` means decorators/enums are unusable (native type-stripping can't execute them), and `verbatimModuleSyntax: true` forces explicit `import type`. `customConditions: ["development"]` supports the path aliases below. `tsconfig.build.json` compiles `src/**/*.ts` (excluding specs) to `./dist`.
- Lint: `oxlint` (`.oxlintrc.json`). Notable rules: relative imports (`./`, `../`), including same-folder siblings, are banned in favor of the `#`-prefixed path aliases below; `no-console` and the `typescript/*` rules (`no-explicit-any`, `no-floating-promises`, `no-misused-promises`, `explicit-module-boundary-types`) are errors. `test/**` has relaxed overrides.
- Format: `oxfmt` (`.oxfmtrc.json`), including import sorting: builtins → externals → `#` aliases → relative → unknown.
- Test runner: native **`node:test`** — `describe`/`it`/`before`/`after` from `node:test`, assertions from `node:assert/strict`, no globals. Run with `--conditions=development` so the `#X/*` aliases resolve to `src/*.ts` instead of `dist/*.js`. Integration tests (`db/*`, migration loading) run against a real local MongoDB via `docker-compose.yml` — a single-node replica set (`rs0`) so transactions work — started/stopped by `test/setup.ts`/`test/teardown.ts` through npm's `pretest`/`posttest` lifecycle scripts (`node:test` has no Jest-style `globalSetup`/`globalTeardown`).

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
`import { consoleLogger } from '#Common/logger'` (enforced by the `no-restricted-imports` oxlint rule above).
Add a further `#<Area>/*` alias here, following the same `development`/`default` pattern, whenever
a new top-level `src/` area is introduced.

## Directives

Hard rules — follow these exactly, no exceptions:

- **Doc first** — before changing code, update README.md and/or CLAUDE.md to describe the change.
- **TDD** — when adding functionality, always start with tests and follow red/green flow.
- **Test coverage** — every source file must have a paired test with at least one invalid and one
  valid case, plus one case per branch or variant of the behavior.
- **context7 first** — for any library, framework, tool, or DSL syntax — JavaScript APIs, testing
  libraries, etc. — always use the context7 MCP server (`resolve-library-id` then `query-docs`)
  instead of guessing from training data. Never guess from memory.
- **Ask when uncertain** — if there's any doubt about intent, or multiple valid approaches exist, ask
  before proceeding; never guess at architectural decisions, design choices, or user preferences.
  Always ask through the interactive questions interface (the AskUserQuestion tool) instead of
  plain text, so the user can pick from options.
- **Review commit messages** — always show the generated commit message and get explicit approval
  before running `git commit`. Never commit without that review. Print the message as final chat
  text (not inside AskUserQuestion), then ask for approval through AskUserQuestion.
