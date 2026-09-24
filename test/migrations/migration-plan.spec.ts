import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { computeMigrationPlan, isMigrationPhase } from '#Migrations/migration-plan'
import type { MigrationRef } from '#Migrations/migration-plan'

const discovered: MigrationRef[] = [
  { version: '1.0.0', phase: 'pre', file: 'create-users.js' },
  { version: '1.0.0', phase: 'pre', file: 'seed-admin.js' },
  { version: '1.2.0', phase: 'pre', file: 'add-user-email-index.js' },
  { version: '2.0.0', phase: 'pre', file: 'add-orders-collection.js' }
]

describe('computeMigrationPlan up', () => {
  it('strips extra fields (e.g. filePath) from discovered migrations, returning only version/phase/file', () => {
    const discoveredWithExtraField = [
      { version: '1.0.0', phase: 'pre' as const, file: 'create-users.js', filePath: '/abs/path/create-users.js' }
    ]
    const plan = computeMigrationPlan({
      direction: 'up',
      phase: 'pre',
      targetVersion: '1.0.0',
      applied: [],
      discovered: discoveredWithExtraField
    })
    assert.deepEqual(plan, [{ version: '1.0.0', phase: 'pre', file: 'create-users.js' }])
  })

  it('runs every pending migration up to and including the target version, ordered ascending', () => {
    const plan = computeMigrationPlan({
      direction: 'up',
      phase: 'pre',
      targetVersion: '1.2.0',
      applied: [],
      discovered
    })
    assert.deepEqual(plan, [
      { version: '1.0.0', phase: 'pre', file: 'create-users.js' },
      { version: '1.0.0', phase: 'pre', file: 'seed-admin.js' },
      { version: '1.2.0', phase: 'pre', file: 'add-user-email-index.js' }
    ])
  })

  it('excludes migrations already applied', () => {
    const plan = computeMigrationPlan({
      direction: 'up',
      phase: 'pre',
      targetVersion: '1.2.0',
      applied: [{ version: '1.0.0', phase: 'pre', file: 'create-users.js' }],
      discovered
    })
    assert.deepEqual(plan, [
      { version: '1.0.0', phase: 'pre', file: 'seed-admin.js' },
      { version: '1.2.0', phase: 'pre', file: 'add-user-email-index.js' }
    ])
  })

  it('excludes migrations above the target version', () => {
    const plan = computeMigrationPlan({
      direction: 'up',
      phase: 'pre',
      targetVersion: '1.0.0',
      applied: [],
      discovered
    })
    assert.deepEqual(plan, [
      { version: '1.0.0', phase: 'pre', file: 'create-users.js' },
      { version: '1.0.0', phase: 'pre', file: 'seed-admin.js' }
    ])
  })

  it('narrows to a single file within the target version when targetFile is given', () => {
    const plan = computeMigrationPlan({
      direction: 'up',
      phase: 'pre',
      targetVersion: '1.0.0',
      targetFile: 'seed-admin.js',
      applied: [],
      discovered
    })
    assert.deepEqual(plan, [{ version: '1.0.0', phase: 'pre', file: 'seed-admin.js' }])
  })

  it('returns an empty plan when everything up to the target version is already applied', () => {
    const plan = computeMigrationPlan({
      direction: 'up',
      phase: 'pre',
      targetVersion: '1.0.0',
      applied: [
        { version: '1.0.0', phase: 'pre', file: 'create-users.js' },
        { version: '1.0.0', phase: 'pre', file: 'seed-admin.js' }
      ],
      discovered
    })
    assert.deepEqual(plan, [])
  })

  it('throws on an invalid target version', () => {
    assert.throws(
      () =>
        computeMigrationPlan({
          direction: 'up',
          phase: 'pre',
          targetVersion: 'not-a-version',
          applied: [],
          discovered
        }),
      /invalid semver/i
    )
  })
})

describe('computeMigrationPlan down', () => {
  const applied: MigrationRef[] = [
    { version: '1.0.0', phase: 'pre', file: 'create-users.js' },
    { version: '1.0.0', phase: 'pre', file: 'seed-admin.js' },
    { version: '1.2.0', phase: 'pre', file: 'add-user-email-index.js' },
    { version: '2.0.0', phase: 'pre', file: 'add-orders-collection.js' }
  ]

  it('rolls back every applied migration from the target version upward, ordered descending', () => {
    const plan = computeMigrationPlan({ direction: 'down', phase: 'pre', targetVersion: '1.0.0', applied, discovered })
    assert.deepEqual(plan, [
      { version: '2.0.0', phase: 'pre', file: 'add-orders-collection.js' },
      { version: '1.2.0', phase: 'pre', file: 'add-user-email-index.js' },
      { version: '1.0.0', phase: 'pre', file: 'seed-admin.js' },
      { version: '1.0.0', phase: 'pre', file: 'create-users.js' }
    ])
  })

  it('rolls back the target version itself, leaving only migrations below it untouched', () => {
    const plan = computeMigrationPlan({ direction: 'down', phase: 'pre', targetVersion: '1.2.0', applied, discovered })
    assert.deepEqual(plan, [
      { version: '2.0.0', phase: 'pre', file: 'add-orders-collection.js' },
      { version: '1.2.0', phase: 'pre', file: 'add-user-email-index.js' }
    ])
  })

  it('narrows to a single applied file within the target version when targetFile is given', () => {
    const plan = computeMigrationPlan({
      direction: 'down',
      phase: 'pre',
      targetVersion: '1.0.0',
      targetFile: 'seed-admin.js',
      applied,
      discovered
    })
    assert.deepEqual(plan, [{ version: '1.0.0', phase: 'pre', file: 'seed-admin.js' }])
  })

  it('returns an empty plan when nothing is applied at or above the target version', () => {
    const plan = computeMigrationPlan({ direction: 'down', phase: 'pre', targetVersion: '3.0.0', applied, discovered })
    assert.deepEqual(plan, [])
  })

  it('throws on an invalid target version', () => {
    assert.throws(
      () =>
        computeMigrationPlan({ direction: 'down', phase: 'pre', targetVersion: 'not-a-version', applied, discovered }),
      /invalid semver/i
    )
  })
})

describe('computeMigrationPlan phases', () => {
  const phasedDiscovered: MigrationRef[] = [
    { version: '1.0.0', phase: 'pre', file: 'create-users.js' },
    { version: '1.0.0', phase: 'post', file: 'drop-legacy-name.js' },
    { version: '1.2.0', phase: 'pre', file: 'cleanup.js' },
    { version: '1.2.0', phase: 'post', file: 'cleanup.js' }
  ]

  it('up only plans migrations of the requested phase', () => {
    const plan = computeMigrationPlan({
      direction: 'up',
      phase: 'pre',
      targetVersion: '1.2.0',
      applied: [],
      discovered: phasedDiscovered
    })
    assert.deepEqual(plan, [
      { version: '1.0.0', phase: 'pre', file: 'create-users.js' },
      { version: '1.2.0', phase: 'pre', file: 'cleanup.js' }
    ])
  })

  it('down only plans migrations of the requested phase', () => {
    const plan = computeMigrationPlan({
      direction: 'down',
      phase: 'post',
      targetVersion: '1.0.0',
      applied: phasedDiscovered,
      discovered: phasedDiscovered
    })
    assert.deepEqual(plan, [
      { version: '1.2.0', phase: 'post', file: 'cleanup.js' },
      { version: '1.0.0', phase: 'post', file: 'drop-legacy-name.js' }
    ])
  })

  it('treats the same filename in pre and post as distinct migrations', () => {
    const plan = computeMigrationPlan({
      direction: 'up',
      phase: 'post',
      targetVersion: '1.2.0',
      applied: [
        { version: '1.0.0', phase: 'pre', file: 'create-users.js' },
        { version: '1.2.0', phase: 'pre', file: 'cleanup.js' }
      ],
      discovered: phasedDiscovered
    })
    assert.deepEqual(plan, [
      { version: '1.0.0', phase: 'post', file: 'drop-legacy-name.js' },
      { version: '1.2.0', phase: 'post', file: 'cleanup.js' }
    ])
  })

  it('scopes targetFile to the requested phase', () => {
    const plan = computeMigrationPlan({
      direction: 'up',
      phase: 'pre',
      targetVersion: '1.0.0',
      targetFile: 'drop-legacy-name.js',
      applied: [],
      discovered: phasedDiscovered
    })
    assert.deepEqual(plan, [])
  })

  it('up post throws, listing them, while pre migrations up to the target version are pending', () => {
    assert.throws(
      () =>
        computeMigrationPlan({
          direction: 'up',
          phase: 'post',
          targetVersion: '1.2.0',
          applied: [{ version: '1.0.0', phase: 'pre', file: 'create-users.js' }],
          discovered: phasedDiscovered
        }),
      /pending pre migrations.*1\.2\.0\/pre\/cleanup\.js/i
    )
  })

  it('up post ignores pending pre migrations above the target version', () => {
    const plan = computeMigrationPlan({
      direction: 'up',
      phase: 'post',
      targetVersion: '1.0.0',
      applied: [{ version: '1.0.0', phase: 'pre', file: 'create-users.js' }],
      discovered: phasedDiscovered
    })
    assert.deepEqual(plan, [{ version: '1.0.0', phase: 'post', file: 'drop-legacy-name.js' }])
  })

  it('up post throws even when targetFile is given', () => {
    assert.throws(
      () =>
        computeMigrationPlan({
          direction: 'up',
          phase: 'post',
          targetVersion: '1.0.0',
          targetFile: 'drop-legacy-name.js',
          applied: [],
          discovered: phasedDiscovered
        }),
      /pending pre migrations.*1\.0\.0\/pre\/create-users\.js/i
    )
  })

  it('down pre throws, listing them, while post migrations from the target version upward are applied', () => {
    assert.throws(
      () =>
        computeMigrationPlan({
          direction: 'down',
          phase: 'pre',
          targetVersion: '1.2.0',
          applied: phasedDiscovered,
          discovered: phasedDiscovered
        }),
      /applied post migrations.*1\.2\.0\/post\/cleanup\.js/i
    )
  })

  it('down pre ignores applied post migrations below the target version', () => {
    const plan = computeMigrationPlan({
      direction: 'down',
      phase: 'pre',
      targetVersion: '1.2.0',
      applied: [
        { version: '1.0.0', phase: 'pre', file: 'create-users.js' },
        { version: '1.0.0', phase: 'post', file: 'drop-legacy-name.js' },
        { version: '1.2.0', phase: 'pre', file: 'cleanup.js' }
      ],
      discovered: phasedDiscovered
    })
    assert.deepEqual(plan, [{ version: '1.2.0', phase: 'pre', file: 'cleanup.js' }])
  })
})

describe('isMigrationPhase', () => {
  it('accepts "pre" and "post"', () => {
    assert.equal(isMigrationPhase('pre'), true)
    assert.equal(isMigrationPhase('post'), true)
  })

  it('rejects any other value, including undefined', () => {
    assert.equal(isMigrationPhase('during'), false)
    assert.equal(isMigrationPhase('PRE'), false)
    assert.equal(isMigrationPhase(undefined), false)
  })
})
