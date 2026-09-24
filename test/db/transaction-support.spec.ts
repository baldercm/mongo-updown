import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { connect } from '#Db/connect'
import { deploymentSupportsTransactions, supportsTransactions } from '#Db/transaction-support'

describe('supportsTransactions', () => {
  it('returns false for a standalone server', () => {
    assert.equal(supportsTransactions({ isWritablePrimary: true, maxWireVersion: 25 }), false)
  })

  it('returns true for a replica set member', () => {
    assert.equal(supportsTransactions({ isWritablePrimary: true, setName: 'rs0' }), true)
  })

  it('returns true for a mongos router', () => {
    assert.equal(supportsTransactions({ isWritablePrimary: true, msg: 'isdbgrid' }), true)
  })
})

describe('deploymentSupportsTransactions', () => {
  it('returns true for the local replica set', async () => {
    const { client, db } = await connect('mongodb://localhost:27017/mongo_updown_test')
    try {
      assert.equal(await deploymentSupportsTransactions(db), true)
    } finally {
      await client.close()
    }
  })
})
