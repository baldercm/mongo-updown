import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { Chalk } from 'chalk'

import { consoleLogger, createConsoleLogger } from '#Common/logger'

// eslint-disable-next-line no-control-regex -- intentionally matching the ANSI escape byte to strip color codes
const stripAnsi = (value: string): string => value.replace(/\x1B\[\d+m/g, '')

describe('consoleLogger', () => {
  it('writes info messages to stdout with a trailing newline', (t) => {
    const write = t.mock.method(process.stdout, 'write', () => true)
    consoleLogger.info('hello')
    assert.match(stripAnsi(String(write.mock.calls[0]?.arguments[0])), /· hello\n$/)
  })

  it('writes error messages to stderr with a trailing newline', (t) => {
    const write = t.mock.method(process.stderr, 'write', () => true)
    consoleLogger.error('oops')
    assert.match(stripAnsi(String(write.mock.calls[0]?.arguments[0])), /✖ oops\n$/)
  })
})

describe('createConsoleLogger', () => {
  const colored = createConsoleLogger(new Chalk({ level: 3 }))
  const plain = createConsoleLogger(new Chalk({ level: 0 }))

  it('dims info messages and prefixes them with "·" when color is supported', (t) => {
    const write = t.mock.method(process.stdout, 'write', () => true)
    colored.info('nothing to do')
    assert.deepEqual(write.mock.calls[0]?.arguments, ['[2m· nothing to do[22m\n'])
  })

  it('colors step messages cyan and prefixes them with "▸" when color is supported', (t) => {
    const write = t.mock.method(process.stdout, 'write', () => true)
    colored.step('applying 1.0.0/x.js')
    assert.deepEqual(write.mock.calls[0]?.arguments, ['[36m▸ applying 1.0.0/x.js[39m\n'])
  })

  it('colors success messages green and prefixes them with "✔" when color is supported', (t) => {
    const write = t.mock.method(process.stdout, 'write', () => true)
    colored.success('applied 1 migration(s)')
    assert.deepEqual(write.mock.calls[0]?.arguments, ['[32m✔ applied 1 migration(s)[39m\n'])
  })

  it('colors error messages red and prefixes them with "✖" when color is supported', (t) => {
    const write = t.mock.method(process.stderr, 'write', () => true)
    colored.error('boom')
    assert.deepEqual(write.mock.calls[0]?.arguments, ['[31m✖ boom[39m\n'])
  })

  it('falls back to plain symbol-prefixed text with no ANSI codes when color is unsupported', (t) => {
    const write = t.mock.method(process.stdout, 'write', () => true)
    plain.success('applied 1 migration(s)')
    assert.deepEqual(write.mock.calls[0]?.arguments, ['✔ applied 1 migration(s)\n'])
  })
})
