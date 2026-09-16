import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { runSequentially } from '#Common/sequential'

describe('runSequentially', () => {
  it('runs each task in order, waiting for the previous one to finish', async () => {
    const order: number[] = []
    await runSequentially([1, 2, 3], async (item) => {
      order.push(item)
    })
    assert.deepEqual(order, [1, 2, 3])
  })

  it('stops running further tasks once one throws, and propagates the error', async () => {
    const ran: number[] = []
    await assert.rejects(
      runSequentially([1, 2, 3], async (item) => {
        ran.push(item)
        if (item === 2) {
          throw new Error('boom')
        }
      }),
      /boom/
    )
    assert.deepEqual(ran, [1, 2])
  })

  it('resolves immediately for an empty list without calling the task', async () => {
    let called = false
    await runSequentially([], async () => {
      called = true
    })
    assert.equal(called, false)
  })
})
