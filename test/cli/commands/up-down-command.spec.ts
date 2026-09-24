import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import type { Db, MongoClient } from 'mongodb'

import { runDownCommand } from '#Cli/commands/down-command'
import { runUpCommand } from '#Cli/commands/up-command'
import type { Logger } from '#Common/logger'
import { connect } from '#Db/connect'
import { getAppliedMigrations } from '#Db/migration-state-store'

function createSilentLogger(): Logger {
  return { info: () => undefined, step: () => undefined, success: () => undefined, error: () => undefined }
}

function createRecordingLogger(): Logger & { readonly messages: string[] } {
  const messages: string[] = []
  const record = (message: string): void => {
    messages.push(message)
  }
  return { messages, info: record, step: record, success: record, error: record }
}

function markerMigrationSource(collectionName: string, marker: string): string {
  return `exports.up = async ({ db }) => { await db.collection('${collectionName}').insertOne({ marker: '${marker}' }) }
exports.down = async ({ db }) => { await db.collection('${collectionName}').deleteMany({ marker: '${marker}' }) }
`
}

describe('runUpCommand / runDownCommand', () => {
  let dir = ''
  let client: MongoClient
  let db: Db
  const stateCollection = `mongo_updown_state_test_${randomUUID()}`
  const sideEffectsCollection = `mongo_updown_side_effects_test_${randomUUID()}`

  async function markers(marker: string): Promise<number> {
    return db.collection(sideEffectsCollection).countDocuments({ marker })
  }

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mongo-updown-up-down-command-'))
    process.env.MONGO_UPDOWN_TEST_URI = 'mongodb://localhost:27017/mongo_updown_test'
    await writeFile(
      join(dir, 'mongo-updown.config.js'),
      `module.exports = {
        mongoUri: { fromEnv: 'MONGO_UPDOWN_TEST_URI' },
        migrationsDir: './migrations',
        stateCollection: '${stateCollection}',
      }\n`
    )
    await mkdir(join(dir, 'migrations', '1.0.0', 'pre'), { recursive: true })
    await mkdir(join(dir, 'migrations', '1.0.0', 'post'), { recursive: true })
    await writeFile(
      join(dir, 'migrations', '1.0.0', 'pre', 'create-marker.js'),
      markerMigrationSource(sideEffectsCollection, '1.0.0-pre')
    )
    await writeFile(
      join(dir, 'migrations', '1.0.0', 'post', 'create-marker.js'),
      markerMigrationSource(sideEffectsCollection, '1.0.0-post')
    )
    ;({ client, db } = await connect('mongodb://localhost:27017/mongo_updown_test'))
  })

  after(async () => {
    await db.collection(stateCollection).drop()
    await db.collection(sideEffectsCollection).drop()
    await client.close()
    delete process.env.MONGO_UPDOWN_TEST_URI
    await rm(dir, { recursive: true, force: true })
  })

  it('refuses to run post migrations while pre migrations are pending, running nothing', async () => {
    await assert.rejects(
      runUpCommand({ cwd: dir, targetVersion: '1.0.0', phase: 'post' }, createSilentLogger()),
      /pending pre migrations.*1\.0\.0\/pre\/create-marker\.js/i
    )
    assert.equal(await markers('1.0.0-post'), 0)
    assert.deepEqual(await getAppliedMigrations(db, stateCollection), [])
  })

  it('applies only pending pre migrations up to the target version and records them', async () => {
    const logger = createRecordingLogger()
    await runUpCommand({ cwd: dir, targetVersion: '1.0.0', phase: 'pre' }, logger)
    assert.equal(await markers('1.0.0-pre'), 1)
    assert.equal(await markers('1.0.0-post'), 0)
    assert.deepEqual(await getAppliedMigrations(db, stateCollection), [
      { version: '1.0.0', phase: 'pre', file: 'create-marker.js' }
    ])
    assert.ok(logger.messages.includes('Applying 1.0.0/pre/create-marker.js...'))
  })

  it('is idempotent: running up again with nothing pending in the phase applies nothing further', async () => {
    const logger = createRecordingLogger()
    await runUpCommand({ cwd: dir, targetVersion: '1.0.0', phase: 'pre' }, logger)
    assert.equal(await markers('1.0.0-pre'), 1)
    assert.deepEqual(logger.messages, ['Nothing to do for phase "pre".'])
  })

  it('applies post migrations once pre migrations are applied', async () => {
    await runUpCommand({ cwd: dir, targetVersion: '1.0.0', phase: 'post' }, createSilentLogger())
    assert.equal(await markers('1.0.0-post'), 1)
    const applied = await getAppliedMigrations(db, stateCollection)
    assert.deepEqual(
      applied.sort((a, b) => a.phase.localeCompare(b.phase)),
      [
        { version: '1.0.0', phase: 'post', file: 'create-marker.js' },
        { version: '1.0.0', phase: 'pre', file: 'create-marker.js' }
      ]
    )
  })

  it('refuses to roll back pre migrations while post migrations are applied, running nothing', async () => {
    await assert.rejects(
      runDownCommand({ cwd: dir, targetVersion: '0.9.0', phase: 'pre' }, createSilentLogger()),
      /applied post migrations.*1\.0\.0\/post\/create-marker\.js/i
    )
    assert.equal(await markers('1.0.0-pre'), 1)
  })

  it('rolls back post migrations, then pre migrations, marking them as no longer applied', async () => {
    await runDownCommand({ cwd: dir, targetVersion: '0.9.0', phase: 'post' }, createSilentLogger())
    assert.equal(await markers('1.0.0-post'), 0)
    assert.equal(await markers('1.0.0-pre'), 1)

    await runDownCommand({ cwd: dir, targetVersion: '0.9.0', phase: 'pre' }, createSilentLogger())
    assert.equal(await markers('1.0.0-pre'), 0)
    assert.deepEqual(await getAppliedMigrations(db, stateCollection), [])
  })

  it('keeps the rollback in the state collection instead of deleting the migration history', async () => {
    const events = await db
      .collection(stateCollection)
      .find({ version: '1.0.0', phase: 'pre', file: 'create-marker.js' })
      .sort({ date: 1 })
      .toArray()
    assert.deepEqual(
      events.map((event) => event.direction),
      ['up', 'down']
    )
  })
})

describe('runDownCommand when a previously applied migration file is missing on disk', () => {
  let dir = ''
  let client: MongoClient
  let db: Db
  const stateCollection = `mongo_updown_state_test_${randomUUID()}`

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mongo-updown-missing-file-'))
    process.env.MONGO_UPDOWN_TEST_URI = 'mongodb://localhost:27017/mongo_updown_test'
    await writeFile(
      join(dir, 'mongo-updown.config.js'),
      `module.exports = {
        mongoUri: { fromEnv: 'MONGO_UPDOWN_TEST_URI' },
        migrationsDir: './migrations',
        stateCollection: '${stateCollection}',
      }\n`
    )
    await mkdir(join(dir, 'migrations', '1.0.0', 'pre'), { recursive: true })
    await writeFile(
      join(dir, 'migrations', '1.0.0', 'pre', 'create-marker.js'),
      `exports.up = async () => {}
exports.down = async () => {}
`
    )
    ;({ client, db } = await connect('mongodb://localhost:27017/mongo_updown_test'))
    await runUpCommand({ cwd: dir, targetVersion: '1.0.0', phase: 'pre' }, createSilentLogger())
    await rm(join(dir, 'migrations', '1.0.0', 'pre', 'create-marker.js'))
  })

  after(async () => {
    await db.collection(stateCollection).drop()
    await client.close()
    delete process.env.MONGO_UPDOWN_TEST_URI
    await rm(dir, { recursive: true, force: true })
  })

  it('throws when a migration recorded as applied no longer exists on disk', async () => {
    await assert.rejects(
      runDownCommand({ cwd: dir, targetVersion: '1.0.0', phase: 'pre' }, createSilentLogger()),
      /1\.0\.0\/pre\/create-marker\.js.*was not found on disk/i
    )
  })
})

describe('runDownCommand after an up run that failed partway through a version', () => {
  let dir = ''
  let client: MongoClient
  let db: Db
  const stateCollection = `mongo_updown_state_test_${randomUUID()}`
  const sideEffectsCollection = `mongo_updown_side_effects_test_${randomUUID()}`

  async function markers(marker: string): Promise<number> {
    return db.collection(sideEffectsCollection).countDocuments({ marker })
  }

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mongo-updown-partial-failure-'))
    process.env.MONGO_UPDOWN_TEST_URI = 'mongodb://localhost:27017/mongo_updown_test'
    await writeFile(
      join(dir, 'mongo-updown.config.js'),
      `module.exports = {
        mongoUri: { fromEnv: 'MONGO_UPDOWN_TEST_URI' },
        migrationsDir: './migrations',
        stateCollection: '${stateCollection}',
      }\n`
    )
    await mkdir(join(dir, 'migrations', '1.2.0', 'pre'), { recursive: true })
    await writeFile(join(dir, 'migrations', '1.2.0', 'pre', 'a.js'), markerMigrationSource(sideEffectsCollection, 'a'))
    await writeFile(join(dir, 'migrations', '1.2.0', 'pre', 'b.js'), markerMigrationSource(sideEffectsCollection, 'b'))
    await writeFile(
      join(dir, 'migrations', '1.2.0', 'pre', 'c.js'),
      `exports.up = async ({ db }) => {
  await db.collection('${sideEffectsCollection}').insertOne({ marker: 'c' })
  throw new Error('c failed halfway')
}
exports.down = async ({ db }) => { await db.collection('${sideEffectsCollection}').deleteMany({ marker: 'c' }) }
`
    )
    ;({ client, db } = await connect('mongodb://localhost:27017/mongo_updown_test'))
  })

  after(async () => {
    await db.collection(stateCollection).drop()
    await db.collection(sideEffectsCollection).drop()
    await client.close()
    delete process.env.MONGO_UPDOWN_TEST_URI
    await rm(dir, { recursive: true, force: true })
  })

  it('stops at the failing migration, keeping the earlier ones applied and recorded', async () => {
    await assert.rejects(
      runUpCommand({ cwd: dir, targetVersion: '1.2.0', phase: 'pre' }, createSilentLogger()),
      /c failed halfway/
    )
    assert.equal(await markers('a'), 1)
    assert.equal(await markers('b'), 1)
    const applied = await getAppliedMigrations(db, stateCollection)
    assert.deepEqual(
      applied.sort((x, y) => x.file.localeCompare(y.file)),
      [
        { version: '1.2.0', phase: 'pre', file: 'a.js' },
        { version: '1.2.0', phase: 'pre', file: 'b.js' }
      ]
    )
  })

  it('rolls back only the recorded migrations in reverse order, never calling down on the failed one', async () => {
    const logger = createRecordingLogger()
    await runDownCommand({ cwd: dir, targetVersion: '1.2.0', phase: 'pre' }, logger)
    assert.deepEqual(logger.messages, [
      'Rolling back 1.2.0/pre/b.js...',
      'Rolling back 1.2.0/pre/a.js...',
      'Rolled back 2 migration(s).'
    ])
    assert.equal(await markers('a'), 0)
    assert.equal(await markers('b'), 0)
    // The failed migration's partial side effect is left in place: it was never recorded, so its down is not run.
    assert.equal(await markers('c'), 1)
    assert.deepEqual(await getAppliedMigrations(db, stateCollection), [])
  })
})

describe('runUpCommand / runDownCommand with transactional migrations', () => {
  let dir = ''
  let client: MongoClient
  let db: Db
  const stateCollection = `mongo_updown_state_test_${randomUUID()}`
  const sideEffectsCollection = `mongo_updown_side_effects_test_${randomUUID()}`

  async function markers(marker: string): Promise<number> {
    return db.collection(sideEffectsCollection).countDocuments({ marker })
  }

  async function events(file: string): Promise<string[]> {
    const docs = await db.collection(stateCollection).find({ file }).sort({ date: 1 }).toArray()
    return docs.map((doc) => String(doc.direction))
  }

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mongo-updown-transactions-'))
    process.env.MONGO_UPDOWN_TEST_URI = 'mongodb://localhost:27017/mongo_updown_test'
    await writeFile(
      join(dir, 'mongo-updown.config.js'),
      `module.exports = {
        mongoUri: { fromEnv: 'MONGO_UPDOWN_TEST_URI' },
        migrationsDir: './migrations',
        stateCollection: '${stateCollection}',
      }\n`
    )
    await mkdir(join(dir, 'migrations', '1.0.0', 'pre'), { recursive: true })
    await mkdir(join(dir, 'migrations', '2.0.0', 'pre'), { recursive: true })
    await writeFile(
      join(dir, 'migrations', '1.0.0', 'pre', 'a-plain.js'),
      `exports.up = async ({ db, session }) => {
  await db.collection('${sideEffectsCollection}').insertOne({ marker: 'plain', hasSession: session !== undefined })
}
exports.down = async ({ db }) => { await db.collection('${sideEffectsCollection}').deleteMany({ marker: 'plain' }) }
`
    )
    await writeFile(
      join(dir, 'migrations', '1.0.0', 'pre', 'b-tx.js'),
      `exports.transaction = true
exports.up = async ({ db, session }) => {
  await db.collection('${sideEffectsCollection}').insertOne({ marker: 'tx', hasSession: session !== undefined }, { session })
}
exports.down = async ({ db, session }) => {
  await db.collection('${sideEffectsCollection}').deleteMany({ marker: 'tx' }, { session })
}
`
    )
    await writeFile(
      join(dir, 'migrations', '2.0.0', 'pre', 'fail-tx.js'),
      `exports.transaction = true
exports.up = async ({ db, session }) => {
  await db.collection('${sideEffectsCollection}').insertOne({ marker: 'fail-tx' }, { session })
  throw new Error('fail-tx failed halfway')
}
exports.down = async () => {}
`
    )
    ;({ client, db } = await connect('mongodb://localhost:27017/mongo_updown_test'))
  })

  after(async () => {
    await db.collection(stateCollection).drop()
    await db.collection(sideEffectsCollection).drop()
    await client.close()
    delete process.env.MONGO_UPDOWN_TEST_URI
    await rm(dir, { recursive: true, force: true })
  })

  it('passes a session only to transactional migrations, recording both', async () => {
    await runUpCommand({ cwd: dir, targetVersion: '1.0.0', phase: 'pre' }, createSilentLogger())
    const plain = await db.collection(sideEffectsCollection).findOne({ marker: 'plain' })
    const tx = await db.collection(sideEffectsCollection).findOne({ marker: 'tx' })
    assert.equal(plain?.hasSession, false)
    assert.equal(tx?.hasSession, true)
    assert.deepEqual(await events('a-plain.js'), ['up'])
    assert.deepEqual(await events('b-tx.js'), ['up'])
  })

  it('discards both the writes and the state record of a transactional migration that throws', async () => {
    await assert.rejects(
      runUpCommand({ cwd: dir, targetVersion: '2.0.0', phase: 'pre' }, createSilentLogger()),
      /fail-tx failed halfway/
    )
    assert.equal(await markers('fail-tx'), 0)
    assert.deepEqual(await events('fail-tx.js'), [])
  })

  it('rolls back a transactional migration within a transaction, recording the down event', async () => {
    await runDownCommand({ cwd: dir, targetVersion: '1.0.0', phase: 'pre' }, createSilentLogger())
    assert.equal(await markers('tx'), 0)
    assert.equal(await markers('plain'), 0)
    assert.deepEqual(await events('b-tx.js'), ['up', 'down'])
    assert.deepEqual(await getAppliedMigrations(db, stateCollection), [])
  })
})

describe('runUpCommand when a later planned migration fails to load', () => {
  let dir = ''
  let client: MongoClient
  let db: Db
  const stateCollection = `mongo_updown_state_test_${randomUUID()}`
  const sideEffectsCollection = `mongo_updown_side_effects_test_${randomUUID()}`

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mongo-updown-load-failure-'))
    process.env.MONGO_UPDOWN_TEST_URI = 'mongodb://localhost:27017/mongo_updown_test'
    await writeFile(
      join(dir, 'mongo-updown.config.js'),
      `module.exports = {
        mongoUri: { fromEnv: 'MONGO_UPDOWN_TEST_URI' },
        migrationsDir: './migrations',
        stateCollection: '${stateCollection}',
      }\n`
    )
    await mkdir(join(dir, 'migrations', '1.0.0', 'pre'), { recursive: true })
    await writeFile(join(dir, 'migrations', '1.0.0', 'pre', 'a.js'), markerMigrationSource(sideEffectsCollection, 'a'))
    await writeFile(join(dir, 'migrations', '1.0.0', 'pre', 'b.js'), 'exports.up = async () => {}\n')
    ;({ client, db } = await connect('mongodb://localhost:27017/mongo_updown_test'))
  })

  after(async () => {
    await client.close()
    delete process.env.MONGO_UPDOWN_TEST_URI
    await rm(dir, { recursive: true, force: true })
  })

  it('runs nothing, not even the migrations before the broken file', async () => {
    await assert.rejects(
      runUpCommand({ cwd: dir, targetVersion: '1.0.0', phase: 'pre' }, createSilentLogger()),
      /b\.js.*must export up\(context\) and down\(context\)/i
    )
    assert.equal(await db.collection(sideEffectsCollection).countDocuments({ marker: 'a' }), 0)
    assert.deepEqual(await getAppliedMigrations(db, stateCollection), [])
  })
})
