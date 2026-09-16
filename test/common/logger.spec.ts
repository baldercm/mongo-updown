import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { consoleLogger } from '#Common/logger'

describe('consoleLogger', () => {
  it('writes info messages to stdout with a trailing newline', (t) => {
    const write = t.mock.method(process.stdout, 'write', () => true)
    consoleLogger.info('hello')
    assert.deepEqual(write.mock.calls[0]?.arguments, ['hello\n'])
  })

  it('writes error messages to stderr with a trailing newline', (t) => {
    const write = t.mock.method(process.stderr, 'write', () => true)
    consoleLogger.error('oops')
    assert.deepEqual(write.mock.calls[0]?.arguments, ['oops\n'])
  })
})
