mongo-updown is an opinionated MongoDB migration tool featuring:

- up/down scripts
- version aware
- written in TypeScript

## Requirements

- Node.js `>=24.21.0` (see `.nvmrc`)
- The official [`mongodb`](https://www.npmjs.com/package/mongodb) driver (`^7.0.0`) installed in
  your project — mongo-updown depends on it as a peer dependency so your project controls the
  exact version.

## Basic usage

Install in your project as an npm devDependency:

```shell
npm i -D mongo-updown mongodb
```

Create the default configuration file:

```shell
npx mongo-updown init
```

Run migrations up to and including a version:

```shell
npx mongo-updown up <version> <file?> --phase <pre|post>
```

Roll back migrations down to a version:

```shell
npx mongo-updown down <version> <file?> --phase <pre|post>
```

`<version>` is a semantic version string (e.g. `1.2.0`). `up` runs every pending migration of the
given phase up to and including that version, in order; `down` rolls back every applied migration
of the given phase from that version upward, inclusive. The optional `<file?>` narrows either
command to a single migration file within that version and phase. `--phase` is required — see
[Deployment phases](#deployment-phases).

Show usage help or the installed version:

```shell
npx mongo-updown --help
npx mongo-updown --version
```

## Configuration

`init` writes `mongo-updown.config.js` to your project root:

```js
module.exports = {
  mongoUri: { fromEnv: 'MONGO_URI' },
  migrationsDir: './migrations',
  stateCollection: 'mongo_updown_migrations'
}
```

The config file never contains a raw connection string, so it's always safe to commit. `mongoUri`
is a pointer to where the connection string actually lives:

- `{ fromEnv: '<NAME>' }` (the default) — read from an environment variable.
- `{ fromFile: '<path>' }` — read from a separate file. If you use this form, **add that file to
  `.gitignore`** — it's the one place the real connection string is written down.

The connection string itself must include the database name (e.g.
`mongodb://localhost:27017/my-app`, not just `mongodb://localhost:27017`) — mongo-updown connects
to the database named in the URI, and the MongoDB driver throws if none is present.

## Writing migrations

Migrations live under `migrationsDir`, one subdirectory per version, and inside it one
subdirectory per [deployment phase](#deployment-phases) — `pre/` and/or `post/`:

```
migrations/
  1.0.0/
    pre/
      create-users-collection.js
  1.2.0/
    pre/
      add-user-email-index.js
    post/
      drop-legacy-username-field.js
```

Every migration must live in a phase subdirectory: a `.js` file placed directly in a version
directory, or any subdirectory other than `pre/`/`post/`, is rejected with an error.

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

- `db` is the database named in the connection string.
- `client` is the connected `MongoClient`, for when you need another database.
- `session` is the `ClientSession` of the migration's transaction when it
  [opts into one](#transactions), and `undefined` otherwise.

Migration files must be plain, already-compiled `.js` — mongo-updown does not transpile
TypeScript at runtime. If you write migrations in TypeScript, compile them before running `up`/
`down`.

## Deployment phases

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

## Failure behavior

Migrations in a plan run one at a time, in order. If one throws, the run stops immediately —
migrations already applied (or rolled back) earlier in that same run stay that way; nothing after
the failure is attempted.

For a migration that isn't [transactional](#transactions), recording that it ran is a separate
write that happens right after its `up`/`down` function returns. A process crash or a failed
state-store write in that narrow window can leave the migration applied but not recorded (or the
reverse on rollback), and the next run would then try to apply it again. Write migrations to be
safe to run twice — e.g. use `createIndex`/upsert-style operations instead of ones that fail on a
second run — so a retry after a partial failure is harmless.

A transactional migration doesn't have this window: its writes and its state record commit
together or not at all. If it throws, none of its writes are kept and it stays pending.

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
- **No parallel operations.** Don't use `Promise.all` over operations inside the transaction;
  await them one at a time.
