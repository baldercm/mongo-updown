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
  return `exports.up = async (db) => { await db.collection('${collectionName}').insertOne({ marker: '${marker}' }) }
exports.down = async (db) => { await db.collection('${collectionName}').deleteMany({ marker: '${marker}' }) }
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
