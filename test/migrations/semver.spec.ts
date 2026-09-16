import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { compareSemver, parseSemver } from '#Migrations/semver'

describe('parseSemver', () => {
  it('parses a valid major.minor.patch string', () => {
    assert.deepEqual(parseSemver('1.2.3'), { major: 1, minor: 2, patch: 3 })
  })

  it('throws on an invalid version string', () => {
    assert.throws(() => parseSemver('1.2'), /invalid semver/i)
  })
})

describe('compareSemver', () => {
  it('orders by major, then minor, then patch', () => {
    assert.equal(compareSemver('1.0.0', '2.0.0') < 0, true)
    assert.equal(compareSemver('1.1.0', '1.0.9') > 0, true)
    assert.equal(compareSemver('1.0.1', '1.0.2') < 0, true)
    assert.equal(compareSemver('1.0.0', '1.0.0'), 0)
  })

  it('throws on an invalid version string', () => {
    assert.throws(() => compareSemver('not-a-version', '1.0.0'), /invalid semver/i)
  })
})
