import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseCliArgs } from '#Cli/dispatch'

describe('parseCliArgs', () => {
  it('parses "init" with no flags', () => {
    assert.deepEqual(parseCliArgs(['init']), { kind: 'init', force: false })
  })

  it('parses "init --force"', () => {
    assert.deepEqual(parseCliArgs(['init', '--force']), { kind: 'init', force: true })
  })

  it('parses "up <version>"', () => {
    assert.deepEqual(parseCliArgs(['up', '1.2.0']), { kind: 'up', targetVersion: '1.2.0', targetFile: undefined })
  })

  it('parses "up <version> <file>"', () => {
    assert.deepEqual(parseCliArgs(['up', '1.2.0', 'add-index.js']), {
      kind: 'up',
      targetVersion: '1.2.0',
      targetFile: 'add-index.js'
    })
  })

  it('parses "down <version> <file>"', () => {
    assert.deepEqual(parseCliArgs(['down', '1.0.0', 'seed.js']), {
      kind: 'down',
      targetVersion: '1.0.0',
      targetFile: 'seed.js'
    })
  })

  it('throws when up/down is missing its version argument', () => {
    assert.throws(() => parseCliArgs(['up']), /usage/i)
  })

  it('throws on an unknown command', () => {
    assert.throws(() => parseCliArgs(['frobnicate']), /unknown command/i)
  })

  it('throws when no command is given', () => {
    assert.throws(() => parseCliArgs([]), /unknown command/i)
  })
})
