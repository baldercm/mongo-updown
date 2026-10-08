# mongo-updown

mongo-updown is an opinionated MongoDB migration tool for Node.js. It runs your up/down migration
scripts in order, up to or back from any semantic version, and adds the safety nets a production
migration tool needs:

- **Up/down scripts** — every migration pairs a forward change with its rollback.
- **Version aware** — target any semver version: `up` applies every pending migration up to it,
  `down` rolls back every applied migration from it upward, in order, in one command.
- **Deployment phases** — optionally split migrations into `pre`/`post` steps, so additive
  changes always land before deploy and destructive cleanup always waits until after (see
  [Deployment phases](#deployment-phases)).
- **Opt-in transactions** — a migration's writes and the record that it ran can commit or abort
  together atomically (see [Transactions](#transactions)).
- **Append-only audit trail** — every migration run is logged and never deleted or rewritten, so
  the full history is always recoverable.
- **No secrets in the config** — the connection string lives in an env var or a file kept out of
  version control, never in the (commit-safe) config itself.

## Requirements

- Node.js `>=24.21.0`
- The official [`mongodb`](https://www.npmjs.com/package/mongodb) driver (`^7.0.0`) installed in
  your project — mongo-updown depends on it as a peer dependency so your project controls the
  exact version.

## Basic usage

Install in your project as an npm devDependency:

```shell
npm i -D mongo-updown mongodb
```

Create the configuration file and the migrations directory:

```shell
npx mongo-updown init [--force] [--phases <true|false>]
```

`init` refuses to overwrite an existing config file unless `--force` is given. `--phases`
(default `true`) chooses whether the generated config uses [deployment
phases](#deployment-phases).

Apply migrations up to and including a version:

```shell
npx mongo-updown up <version> <file?> [--phase <pre|post>]
```

Roll back migrations from a version upward, inclusive:

```shell
npx mongo-updown down <version> <file?> [--phase <pre|post>]
```

`<version>` is a semantic version string (e.g. `1.2.0`). `up` runs every pending migration up to
and including that version; `down` rolls back every applied migration from that version upward,
inclusive. Both run in a fixed order — see [Execution order](#execution-order). The optional
`<file?>` narrows either command to a single migration file within that version. Whether
`--phase` is required depends on the project's config: it's required when `phases: true` and must
be omitted when `phases: false` — see [Deployment phases](#deployment-phases).

Run every command from your project root: mongo-updown reads `mongo-updown.config.js` from the
current directory and resolves relative paths in it from there. A failed command exits with code
`1`.

Show usage help or the installed version:

```shell
npx mongo-updown --help     # or -h
npx mongo-updown --version  # or -v
```

## Configuration

`init` writes `mongo-updown.config.js` to your project root, using the module format of your
project (`export default` when your `package.json` has `"type": "module"`, `module.exports`
otherwise):

```js
module.exports = {
  phases: true,
  mongoUri: { fromEnv: 'MONGO_URI' },
  migrationsDir: './migrations',
  stateCollection: 'mongo_updown_migrations'
}
```

Every field is required — there are no defaults:

- `phases` (`boolean`) — whether migrations are split into `pre`/`post` [deployment
  phases](#deployment-phases) (`true`) or run as a single flat, ordered set (`false`).
- `mongoUri` — where the connection string lives (see below).
- `migrationsDir` (`string`) — the directory holding your migrations.
- `stateCollection` (`string`) — the collection mongo-updown logs migration runs to.

The config file never contains a raw connection string, so it's always safe to commit. `mongoUri`
is a pointer to where the connection string actually lives:

- `{ fromEnv: '<NAME>' }` (what `init` generates) — read from an environment variable.
- `{ fromFile: '<path>' }` — read from a separate file (surrounding whitespace is trimmed). The
  path can be absolute (e.g. `/etc/my-app/mongo-uri`), start with `~/` for your home directory
  (e.g. `~/.config/my-app/mongo-uri`), or be relative to the directory you run mongo-updown
  from. The file doesn't need to be inside your repository: keep it outside and there's
  nothing to ignore. If you do keep it inside, **add it to `.gitignore`** — it's the one place
  the real connection string is written down.

The connection string must include the database name (e.g. `mongodb://localhost:27017/my-app`,
not just `mongodb://localhost:27017`): migrations and their state run against that database, and
mongo-updown rejects a connection string without one rather than let the driver silently fall
back to its default `test` database.

## Writing migrations

Migrations live under `migrationsDir`, one subdirectory per version. Every subdirectory there
must be named with a plain `major.minor.patch` version (`1.2.0`, not `v1.2.0` or `1.2.0-beta.1`);
anything else is rejected with an error. The layout inside each version directory depends on the
config's `phases` field.

With `phases: true`, each version directory has one subdirectory per [deployment
phase](#deployment-phases) — `pre/` and/or `post/`:

```
migrations/
  1.0.0/
    pre/
      001-create-users-collection.js
  1.2.0/
    pre/
      001-add-user-email-index.js
    post/
      001-drop-legacy-username-field.js
```

Every migration must live in a phase subdirectory: a `.js` file placed directly in a version
directory, or any subdirectory other than `pre/`/`post/`, is rejected with an error.

With `phases: false`, migration files live directly in their version directory — there are no
phase subdirectories at all:

```
migrations/
  1.0.0/
    001-create-users-collection.js
  1.2.0/
    001-add-user-email-index.js
    002-drop-legacy-username-field.js
```

Any subdirectory found under a version directory in this mode — including a leftover `pre/` or
`post/` from switching modes — is rejected with an error, since flat mode expects only `.js`
files there. In both modes, non-`.js` files are ignored.

Each migration file exports `up` and `down`. Both receive a single context object,
`{ db, client, session }`:

```js
exports.up = async ({ db }) => {
  await db.createCollection('users')
}

exports.down = async ({ db }) => {
  await db.collection('users').drop()
}
```

In an ES module, use named exports (`export const up = …`) or a default export object
(`export default { up, down }`).

- `db` is the database named in the connection string.
- `client` is the connected `MongoClient`, for when you need another database.
- `session` is the `ClientSession` of the migration's transaction when it
  [opts into one](#transactions), and `undefined` otherwise.

Migration files must be plain, already-compiled `.js` — mongo-updown does not transpile
TypeScript at runtime. If you write migrations in TypeScript, compile them before running `up`/
`down`.

Don't delete or rename a migration file once it has been applied: mongo-updown identifies
migrations by their path, so `down` fails when an applied migration is no longer on disk, and a
renamed file is treated as a new, pending migration.

## Execution order

Migrations run in a deterministic order:

- **Across versions:** by semver, not alphabetically (`1.2.0` runs before `1.10.0`).
- **Within a version (and phase):** by filename. `up` runs files in ascending order; `down` is the
  exact reverse — versions descending, filenames descending.
- **Phases:** each run executes a single phase, so `pre` and `post` files are never interleaved —
  see [Deployment phases](#deployment-phases).

mongo-updown doesn't read a manifest or file timestamps, so **the filename is the only way to
control order inside a version**. Prefix files with a zero-padded number or a timestamp, as in the
examples above. Zero-padding matters because names are compared as text: `10-x.js` sorts before
`2-x.js`. Passing `<file?>` to `up`/`down` skips ordering entirely and runs only that file.

## Deployment phases

This section applies only when the project's config has `phases: true`. With `phases: false`,
there's no phase concept at all: `up`/`down` runs the entire flat set of migrations in one command,
with no phase-ordering guard.

Every migration belongs to one of two phases, chosen by the subdirectory it lives in:

- **`pre`** — runs **before** the new application version is deployed. Use it for additive,
  backward-compatible changes the new code depends on (new collections, indexes, backfills),
  which the currently running old code tolerates.
- **`post`** — runs **after** the new version is deployed. Use it for destructive or cleanup
  changes the old code would break on (dropping fields, removing old indexes).

Each `up`/`down` run executes exactly one phase, so a typical deployment is:

```shell
npx mongo-updown up 1.2.0 --phase pre
# deploy application 1.2.0
npx mongo-updown up 1.2.0 --phase post
```

and a rollback reverses it:

```shell
npx mongo-updown down 1.2.0 --phase post
# roll back the application deployment
npx mongo-updown down 1.2.0 --phase pre
```

mongo-updown enforces this order: `up <version> --phase post` fails while any `pre` migration up
to that version is still pending, and `down <version> --phase pre` fails while any `post`
migration from that version upward is still applied. Nothing runs when the check fails.

**Choose `phases` once.** Switching an existing project between `phases: true` and
`phases: false` isn't supported yet: the phase is part of each recorded migration's identity, so
after a switch every previously applied migration looks pending and the next `up` would run them
all again.

## Failure behavior

Migrations in a plan run one at a time, in order. If one throws, the run stops immediately —
migrations already applied (or rolled back) earlier in that same run stay that way; nothing after
the failure is attempted, and the command exits with code `1`.

Before running anything, mongo-updown loads every migration in the plan, so a file that fails to
import or doesn't export `up`/`down` stops the run before any migration executes.

For a migration that isn't [transactional](#transactions), recording that it ran is a separate
write that happens right after its `up`/`down` function returns. A process crash or a failed
state-store write in that narrow window can leave the migration applied but not recorded (or the
reverse on rollback), and the next run would then try to apply it again. Write migrations to be
safe to run twice — e.g. use `createIndex`/upsert-style operations instead of ones that fail on a
second run — so a retry after a partial failure is harmless.

A transactional migration doesn't have this window: its writes and its state record commit
together or not at all. If it throws, none of its writes are kept and its state is unchanged — it
stays pending after a failed `up`, and stays applied after a failed `down`.

## Transactions

A migration can opt into running inside a MongoDB transaction by exporting `transaction = true`.
Its `up`/`down` writes and the record that it ran are then committed atomically:

```js
exports.transaction = true

exports.up = async ({ db, session }) => {
  await db.collection('users').updateMany({ role: { $exists: false } }, { $set: { role: 'member' } }, { session })
}

exports.down = async ({ db, session }) => {
  await db.collection('users').updateMany({ role: 'member' }, { $unset: { role: '' } }, { session })
}
```

With ES modules, use `export const transaction = true`.

Transactions are opt-in because they come with MongoDB's restrictions:

- **Replica set or sharded cluster required.** Standalone servers don't support transactions.
  mongo-updown checks this before running anything and fails, listing the transactional migrations
  in the plan, when the server can't run them.
- **Pass `{ session }` to every operation.** An operation without it runs outside the
  transaction, isn't rolled back on failure, and no error is raised.
- **Most schema changes aren't allowed.** Creating an index on an existing collection, dropping
  an index or collection, renaming a collection, and `collMod` can't run in a transaction. Keep
  those in non-transactional migrations.
- **Time limit.** By default the server aborts a transaction after 60 seconds
  (`transactionLifetimeLimitSeconds`). Large backfills belong in non-transactional migrations,
  or should be split up.
- **The function can run more than once.** On a transient error the driver retries the whole
  `up`/`down` function. Don't do side effects outside the database (HTTP calls, files) in it.
- **No parallel operations.** MongoDB doesn't support running operations on a transaction's
  session concurrently: depending on timing it fails with `ConflictingOperationInProgress` or
  happens to work. mongo-updown makes this deterministic. If two operations on the migration's
  session are ever in flight at once (`Promise.all`, operations started without `await`, …), it
  aborts the transaction and fails the migration with an error saying so. Await each operation
  before starting the next.

## Development

Contributing needs [pnpm](https://pnpm.io) and Docker — the test suite runs against a local
single-node MongoDB replica set started through `docker-compose.yml`:

```shell
pnpm install
pnpm test   # starts MongoDB, runs the tests, stops MongoDB
```

`pnpm run typecheck`, `pnpm run lint`, and `pnpm run format:check` run the remaining CI checks.

## License

[MIT](LICENSE)
