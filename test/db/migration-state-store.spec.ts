import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'

import type { Db, MongoClient } from 'mongodb'

import { connect } from '#Db/connect'
import { getAppliedMigrations, recordMigrationDown, recordMigrationUp } from '#Db/migration-state-store'

describe('migration-state-store', () => {
  let client: MongoClient
  let db: Db
  const collectionName = `mongo_updown_migrations_test_${randomUUID()}`

  before(async () => {
    ;({ client, db } = await connect('mongodb://localhost:27017/mongo_updown_test'))
  })

  after(async () => {
    await db.collection(collectionName).drop()
    await client.close()
  })

  it('starts with no applied migrations', async () => {
    assert.deepEqual(await getAppliedMigrations(db, collectionName), [])
  })

  it('records an "up" event so the migration is returned as applied', async () => {
    await recordMigrationUp(db, collectionName, { version: '1.0.0', file: 'create-users.js' })
    assert.deepEqual(await getAppliedMigrations(db, collectionName), [{ version: '1.0.0', file: 'create-users.js' }])
  })

  it('records a "down" event so the migration is no longer returned as applied, without deleting its history', async () => {
    await recordMigrationUp(db, collectionName, { version: '1.2.0', file: 'add-index.js' })
    await recordMigrationDown(db, collectionName, { version: '1.0.0', file: 'create-users.js' })

    assert.deepEqual(await getAppliedMigrations(db, collectionName), [{ version: '1.2.0', file: 'add-index.js' }])

    const history = await db.collection(collectionName).find({ version: '1.0.0', file: 'create-users.js' }).toArray()
    assert.deepEqual(
      history.map((doc) => doc.direction),
      ['up', 'down']
    )
  })

  it('is applied again after a "down" is followed by another "up", keeping every event', async () => {
    await recordMigrationUp(db, collectionName, { version: '1.0.0', file: 'create-users.js' })

    const applied = await getAppliedMigrations(db, collectionName)
    assert.deepEqual(
      applied.sort((a, b) => a.version.localeCompare(b.version)),
      [
        { version: '1.0.0', file: 'create-users.js' },
        { version: '1.2.0', file: 'add-index.js' }
      ]
    )

    const history = await db.collection(collectionName).find({ version: '1.0.0', file: 'create-users.js' }).toArray()
    assert.deepEqual(
      history.map((doc) => doc.direction),
      ['up', 'down', 'up']
    )
  })

  it('does not persist extra fields (e.g. filePath) beyond version/file/direction/date', async () => {
    const migrationWithExtraField = { version: '2.0.0', file: 'add-orders.js', filePath: '/abs/path/add-orders.js' }
    await recordMigrationUp(db, collectionName, migrationWithExtraField)
    const stored = await db.collection(collectionName).findOne({ version: '2.0.0' })
    assert.deepEqual(Object.keys(stored ?? {}).sort(), ['_id', 'date', 'direction', 'file', 'version'])
  })
})
