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
npx mongo-updown up <version> <file?>
```

Roll back migrations down to a version:

```shell
npx mongo-updown down <version> <file?>
```

`<version>` is a semantic version string (e.g. `1.2.0`). `up` runs every pending migration up to
and including that version, in order; `down` rolls back every applied migration from that version
upward, inclusive. The optional `<file?>` narrows either command to a single migration file within
that version.

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

## Writing migrations

Migrations live under `migrationsDir`, one subdirectory per version:

```
migrations/
  1.0.0/
    create-users-collection.js
  1.2.0/
    add-user-email-index.js
```

Each migration file exports `up` and `down`:

```js
exports.up = async (db, client) => {
  await db.createCollection('users')
}

exports.down = async (db, client) => {
  await db.collection('users').drop()
}
```

Migration files must be plain, already-compiled `.js` — mongo-updown does not transpile
TypeScript at runtime. If you write migrations in TypeScript, compile them before running `up`/
`down`.
