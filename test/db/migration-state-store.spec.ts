import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'

import type { Db, MongoClient } from 'mongodb'

import { connect } from '#Db/connect'
import { getAppliedMigrations, recordAppliedMigration, removeAppliedMigration } from '#Db/migration-state-store'

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

  it('records an applied migration so it is returned afterwards', async () => {
    await recordAppliedMigration(db, collectionName, { version: '1.0.0', file: 'create-users.js' })
    assert.deepEqual(await getAppliedMigrations(db, collectionName), [{ version: '1.0.0', file: 'create-users.js' }])
  })

  it('removes an applied migration so it is no longer returned', async () => {
    await recordAppliedMigration(db, collectionName, { version: '1.2.0', file: 'add-index.js' })
    await removeAppliedMigration(db, collectionName, { version: '1.0.0', file: 'create-users.js' })
    assert.deepEqual(await getAppliedMigrations(db, collectionName), [{ version: '1.2.0', file: 'add-index.js' }])
  })

  it('does not persist extra fields (e.g. filePath) beyond version/file/appliedAt', async () => {
    const migrationWithExtraField = { version: '2.0.0', file: 'add-orders.js', filePath: '/abs/path/add-orders.js' }
    await recordAppliedMigration(db, collectionName, migrationWithExtraField)
    const stored = await db.collection(collectionName).findOne({ version: '2.0.0' })
    assert.deepEqual(Object.keys(stored ?? {}).sort(), ['_id', 'appliedAt', 'file', 'version'])
  })
})
