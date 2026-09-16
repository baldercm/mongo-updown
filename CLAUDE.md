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
npx mongo-updown up <version> <file?>
npx mongo-updown down <version> <file?>
```

## Architecture

- **`up <version> <file?>`** applies every pending migration up to and including `<version>`, in
  order; `down <version> <file?>` rolls back everything applied from `<version>` upward, inclusive. `<file?>`
  narrows either command to a single migration file within the target version.
- **`--help`/`-h`** prints usage and exits 0; **`--version`/`-v`** prints the installed package
  version (read from `package.json` at runtime, resolved relative to `bin.ts`/`bin.js` so it works
  in both dev and the compiled `dist/` output) and exits 0. Recognized only as the first argument.
- **Versions are semver strings** (`major.minor.patch`), compared with semver rules.
- **Migration layout**: `<migrationsDir>/<version>/<filename>.js` — the version is the directory
  name, not part of the filename (e.g. `migrations/1.2.0/add-user-index.js`). Migration files must
  already be compiled `.js`; mongo-updown does no TypeScript execution of user migrations, just a
  plain dynamic `import()`. Each file exports `up(db, client)` / `down(db, client)`.
- **State tracking**: a dedicated collection (default `mongo_updown_migrations`) with documents
  shaped `{ version, file, appliedAt }`, used to diff "already applied" against "on disk".
- **Failure behavior**: `runMigrationCommand` (`src/cli/commands/run-migration-command.ts`) runs a
  plan sequentially and stops at the first throw, leaving earlier steps in that run applied/rolled
  back as they completed. Recording state is a separate write after the migration function
  returns — not wrapped in a transaction — so a crash or state-store failure in that window can
  leave a migration applied-but-unrecorded (or the reverse on rollback), and the next run will
  attempt it again. This is an accepted trade-off, not a bug: user migrations are expected to be
  safe to run twice.
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
- Test runner: native **`node:test`** (not Jest, despite what the scaffolding originally anticipated) — `describe`/`it`/`before`/`after` from `node:test`, assertions from `node:assert/strict`, no globals. Run as `node --conditions=development --test "test/**/*.spec.ts"`; `--conditions=development` is what makes the `#X/*` aliases resolve to `src/*.ts` (see below) instead of `dist/*.js`. Integration tests (`db/*`, migration loading) run against a real local MongoDB via `docker-compose.yml`, started/stopped by `test/setup.ts`/`test/teardown.ts` through npm's `pretest`/`posttest` lifecycle scripts (`node:test` has no Jest-style `globalSetup`/`globalTeardown`).

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
