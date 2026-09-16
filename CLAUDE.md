# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

The repository has toolchain scaffolding (git, pnpm, TypeScript, lint/format configs) but no application source yet — there is no `src/` or `test/` directory, and `package.json`'s `main` (`index.js`) does not exist. Treat this as a greenfield implementation guided by the tooling configs already committed.

Gap to be aware of: `tsconfig.json`'s `types: ["node", "jest"]` and `.oxlintrc.json`'s `env.jest: true` anticipate Jest as the test runner, but no test framework is in `devDependencies` yet — it needs to be installed before any tests can be written or run (`package.json`'s `test` script is still the placeholder `echo "Error: no test specified" && exit 1`).

## Intended purpose (from README.md)

mongo-updown is planned to be an opinionated MongoDB migration tool, written in TypeScript, featuring:

- up/down migration scripts
- version-aware migrations

Planned CLI usage (not yet implemented):

```shell
npm i -D mongo-updown
npx mongo-updown init
npx mongo-updown up <version> <file?>
npx mongo-updown down <version> <file?>
```

Keep the CLI surface (`init`, `up`, `down`) and the up/down + version-aware migration model described above as the north star for the architecture.

## Commands

```shell
pnpm install          # install deps
pnpm run build         # build (tsc -p tsconfig.build.json, emits to ./dist)
pnpm run typecheck     # typecheck only (tsc --noEmit)
pnpm run lint          # lint (oxlint .)
pnpm run format        # format and write (oxfmt .)
pnpm run format:check  # check formatting without writing (oxfmt --check .)
```

There is no test runner installed yet (see gap noted above), so there is no `test` script beyond the placeholder and no way to run tests, single or otherwise, until one (e.g. Jest, implied by the existing config) is added as a dependency.

## Toolchain

- Package manager: **pnpm** (`pnpm-workspace.yaml` pins `nodeVersion: '24.21.0'`, `saveExact: true`). Node version is also pinned via `.nvmrc` (`24`). Dependencies are added with exact versions (see `typescript: "7.0.2"` in `package.json`, no `^`/`~`).
- Language: TypeScript, strict mode, target `ES2024`, `module: nodenext` (see `tsconfig.json`). `tsconfig.build.json` extends it for compiling `src/**/*.ts` while excluding `**/*spec.ts`, emitting to `./dist`.
- Lint: `oxlint` (`.oxlintrc.json`) — notable non-default rules once code exists:
  - Relative imports (`./`, `../`) are banned; use the path aliases defined in `tsconfig.json`'s `paths` instead.
  - `no-console`, `typescript/no-explicit-any`, `typescript/no-floating-promises`, `typescript/no-misused-promises`, and `typescript/explicit-module-boundary-types` are errors.
  - `test/**` and `test/setup.ts`/`test/teardown.ts` have relaxed overrides (e.g. `no-restricted-imports` off for setup/teardown).
- Format: `oxfmt` (`.oxfmtrc.json`) — no semicolons, single quotes, 2-space indent, 120 print width, no trailing commas, and import sorting grouped as: builtins → externals → `@`-prefixed path-alias imports → relative imports → unknown.

### Path aliases

`tsconfig.json` defines path aliases under `paths` that the codebase is expected to grow into (the directory doesn't exist yet):

```
@Common/* -> src/common/*
```

Import shared/common code via `@Common/*` rather than a relative path (enforced by the `no-restricted-imports` oxlint rule above). Add further aliases here as new top-level source areas are introduced.

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
