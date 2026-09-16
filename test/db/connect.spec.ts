import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { connect } from '#Db/connect'

describe('connect', () => {
  it('connects and returns a usable db handle', async () => {
    const { client, db } = await connect('mongodb://localhost:27017/mongo_updown_test')
    try {
      assert.equal(db.databaseName, 'mongo_updown_test')
      await db.command({ ping: 1 })
    } finally {
      await client.close()
    }
  })

  it('rejects when the server is unreachable', async () => {
    await assert.rejects(connect('mongodb://127.0.0.1:1/mongo_updown_test?serverSelectionTimeoutMS=200'))
  })
})
