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

describe('runUpCommand / runDownCommand', () => {
  let dir = ''
  let client: MongoClient
  let db: Db
  const stateCollection = `mongo_updown_state_test_${randomUUID()}`
  const sideEffectsCollection = `mongo_updown_side_effects_test_${randomUUID()}`

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
    await mkdir(join(dir, 'migrations', '1.0.0'), { recursive: true })
    await writeFile(
      join(dir, 'migrations', '1.0.0', 'create-marker.js'),
      `exports.up = async (db) => { await db.collection('${sideEffectsCollection}').insertOne({ marker: '1.0.0' }) }
exports.down = async (db) => { await db.collection('${sideEffectsCollection}').deleteMany({ marker: '1.0.0' }) }
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

  it('applies pending migrations up to the target version and records them', async () => {
    await runUpCommand({ cwd: dir, targetVersion: '1.0.0' }, createSilentLogger())
    const markers = await db.collection(sideEffectsCollection).find({ marker: '1.0.0' }).toArray()
    assert.equal(markers.length, 1)
    assert.deepEqual(await getAppliedMigrations(db, stateCollection), [{ version: '1.0.0', file: 'create-marker.js' }])
  })

  it('is idempotent: running up again with nothing pending applies nothing further', async () => {
    await runUpCommand({ cwd: dir, targetVersion: '1.0.0' }, createSilentLogger())
    const markers = await db.collection(sideEffectsCollection).find({ marker: '1.0.0' }).toArray()
    assert.equal(markers.length, 1)
  })

  it('rolls back applied migrations above the target version and removes their state', async () => {
    await runDownCommand({ cwd: dir, targetVersion: '0.9.0' }, createSilentLogger())
    const markers = await db.collection(sideEffectsCollection).find({ marker: '1.0.0' }).toArray()
    assert.equal(markers.length, 0)
    assert.deepEqual(await getAppliedMigrations(db, stateCollection), [])
  })
})
