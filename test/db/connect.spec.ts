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

  it('enables command monitoring, which the transaction concurrency guard relies on', async () => {
    const { client } = await connect('mongodb://localhost:27017/mongo_updown_test')
    try {
      assert.equal(client.options.monitorCommands, true)
    } finally {
      await client.close()
    }
  })

  it('uses the database named in the connection string when it also has options', async () => {
    const { client, db } = await connect('mongodb://localhost:27017/mongo_updown_test?serverSelectionTimeoutMS=5000')
    try {
      assert.equal(db.databaseName, 'mongo_updown_test')
    } finally {
      await client.close()
    }
  })

  for (const mongoUri of [
    'mongodb://localhost:27017',
    'mongodb://localhost:27017/',
    'mongodb://localhost:27017/?replicaSet=rs0',
    'mongodb://user:pass@localhost:27017,localhost:27018',
    'mongodb+srv://cluster.example.com/?retryWrites=true'
  ]) {
    it(`rejects a connection string without a database name (${mongoUri})`, async () => {
      await assert.rejects(connect(mongoUri), /must include a database name/)
    })
  }

  it('rejects when the server is unreachable', async () => {
    await assert.rejects(connect('mongodb://127.0.0.1:1/mongo_updown_test?serverSelectionTimeoutMS=200'))
  })
})
