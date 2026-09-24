import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'

import type { ClientSession, Db, MongoClient } from 'mongodb'

import { connect } from '#Db/connect'
import { watchSessionConcurrency } from '#Db/session-concurrency-guard'

describe('watchSessionConcurrency', () => {
  let client: MongoClient
  let db: Db
  const collectionName = `mongo_updown_concurrency_test_${randomUUID()}`

  async function inTransaction(fn: (session: ClientSession) => Promise<unknown>): Promise<boolean> {
    const session = client.startSession()
    try {
      session.startTransaction()
      const guard = watchSessionConcurrency(client, session)
      try {
        await fn(session)
      } finally {
        guard.dispose()
        await session.abortTransaction()
      }
      return guard.overlapped
    } finally {
      await session.endSession()
    }
  }

  before(async () => {
    ;({ client, db } = await connect('mongodb://localhost:27017/mongo_updown_test'))
    await db.createCollection(collectionName)
  })

  after(async () => {
    await db.collection(collectionName).drop()
    await client.close()
  })

  it('reports no overlap when operations on the session are awaited one at a time', async () => {
    const overlapped = await inTransaction(async (session) => {
      await db.collection(collectionName).insertOne({ i: 0 }, { session })
      await db.collection(collectionName).insertOne({ i: 1 }, { session })
      await db.collection(collectionName).find({}, { session }).toArray()
    })
    assert.equal(overlapped, false)
  })

  it('reports overlap when operations on the session run in parallel', async () => {
    const overlapped = await inTransaction(async (session) => {
      await db.collection(collectionName).insertOne({ i: 0 }, { session })
      await Promise.all([0, 1, 2].map((i) => db.collection(collectionName).insertOne({ i }, { session })))
    })
    assert.equal(overlapped, true)
  })

  it('ignores parallel operations that do not use the watched session', async () => {
    const overlapped = await inTransaction(async (session) => {
      await db.collection(collectionName).insertOne({ i: 0 }, { session })
      await Promise.all([
        db.collection(collectionName).countDocuments(),
        db.collection(collectionName).countDocuments()
      ])
    })
    assert.equal(overlapped, false)
  })

  it('removes its listeners when disposed', () => {
    const before = client.listenerCount('commandStarted')
    const session = client.startSession()
    const guard = watchSessionConcurrency(client, session)
    assert.equal(client.listenerCount('commandStarted'), before + 1)
    guard.dispose()
    assert.equal(client.listenerCount('commandStarted'), before)
    assert.equal(client.listenerCount('commandSucceeded'), 0)
    assert.equal(client.listenerCount('commandFailed'), 0)
    void session.endSession()
  })
})
