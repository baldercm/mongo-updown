import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseCliArgs } from '#Cli/dispatch'

describe('parseCliArgs', () => {
  it('parses "--help"', () => {
    assert.deepEqual(parseCliArgs(['--help']), { kind: 'help' })
  })

  it('parses "-h"', () => {
    assert.deepEqual(parseCliArgs(['-h']), { kind: 'help' })
  })

  it('parses "--version"', () => {
    assert.deepEqual(parseCliArgs(['--version']), { kind: 'version' })
  })

  it('parses "-v"', () => {
    assert.deepEqual(parseCliArgs(['-v']), { kind: 'version' })
  })

  it('parses "init" with no flags', () => {
    assert.deepEqual(parseCliArgs(['init']), { kind: 'init', force: false })
  })

  it('parses "init --force"', () => {
    assert.deepEqual(parseCliArgs(['init', '--force']), { kind: 'init', force: true })
  })

  it('parses "up <version> --phase pre"', () => {
    assert.deepEqual(parseCliArgs(['up', '1.2.0', '--phase', 'pre']), {
      kind: 'up',
      targetVersion: '1.2.0',
      targetFile: undefined,
      phase: 'pre'
    })
  })

  it('parses "up <version> <file> --phase post"', () => {
    assert.deepEqual(parseCliArgs(['up', '1.2.0', 'add-index.js', '--phase', 'post']), {
      kind: 'up',
      targetVersion: '1.2.0',
      targetFile: 'add-index.js',
      phase: 'post'
    })
  })

  it('parses "down <version> <file> --phase pre"', () => {
    assert.deepEqual(parseCliArgs(['down', '1.0.0', 'seed.js', '--phase', 'pre']), {
      kind: 'down',
      targetVersion: '1.0.0',
      targetFile: 'seed.js',
      phase: 'pre'
    })
  })

  it('parses "--phase" placed before the positionals', () => {
    assert.deepEqual(parseCliArgs(['down', '--phase=post', '1.0.0']), {
      kind: 'down',
      targetVersion: '1.0.0',
      targetFile: undefined,
      phase: 'post'
    })
  })

  it('throws when up/down is missing its version argument', () => {
    assert.throws(() => parseCliArgs(['up', '--phase', 'pre']), /usage/i)
  })

  it('throws when up/down is missing --phase', () => {
    assert.throws(() => parseCliArgs(['up', '1.2.0']), /usage.*--phase <pre\|post>/i)
  })

  it('throws when --phase is not pre or post', () => {
    assert.throws(() => parseCliArgs(['down', '1.2.0', '--phase', 'during']), /usage.*--phase <pre\|post>/i)
  })

  it('throws when --phase has no value', () => {
    assert.throws(() => parseCliArgs(['up', '1.2.0', '--phase']))
  })

  it('throws on an unknown command', () => {
    assert.throws(() => parseCliArgs(['frobnicate']), /unknown command/i)
  })

  it('treats no command as "--help"', () => {
    assert.deepEqual(parseCliArgs([]), { kind: 'help' })
  })
})
