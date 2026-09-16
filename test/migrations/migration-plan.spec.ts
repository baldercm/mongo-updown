import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { computeMigrationPlan } from '#Migrations/migration-plan'

const discovered = [
  { version: '1.0.0', file: 'create-users.js' },
  { version: '1.0.0', file: 'seed-admin.js' },
  { version: '1.2.0', file: 'add-user-email-index.js' },
  { version: '2.0.0', file: 'add-orders-collection.js' }
]

describe('computeMigrationPlan up', () => {
  it('strips extra fields (e.g. filePath) from discovered migrations, returning only version/file', () => {
    const discoveredWithExtraField = [
      { version: '1.0.0', file: 'create-users.js', filePath: '/abs/path/create-users.js' }
    ]
    const plan = computeMigrationPlan({
      direction: 'up',
      targetVersion: '1.0.0',
      applied: [],
      discovered: discoveredWithExtraField
    })
    assert.deepEqual(plan, [{ version: '1.0.0', file: 'create-users.js' }])
  })

  it('runs every pending migration up to and including the target version, ordered ascending', () => {
    const plan = computeMigrationPlan({ direction: 'up', targetVersion: '1.2.0', applied: [], discovered })
    assert.deepEqual(plan, [
      { version: '1.0.0', file: 'create-users.js' },
      { version: '1.0.0', file: 'seed-admin.js' },
      { version: '1.2.0', file: 'add-user-email-index.js' }
    ])
  })

  it('excludes migrations already applied', () => {
    const plan = computeMigrationPlan({
      direction: 'up',
      targetVersion: '1.2.0',
      applied: [{ version: '1.0.0', file: 'create-users.js' }],
      discovered
    })
    assert.deepEqual(plan, [
      { version: '1.0.0', file: 'seed-admin.js' },
      { version: '1.2.0', file: 'add-user-email-index.js' }
    ])
  })

  it('excludes migrations above the target version', () => {
    const plan = computeMigrationPlan({ direction: 'up', targetVersion: '1.0.0', applied: [], discovered })
    assert.deepEqual(plan, [
      { version: '1.0.0', file: 'create-users.js' },
      { version: '1.0.0', file: 'seed-admin.js' }
    ])
  })

  it('narrows to a single file within the target version when targetFile is given', () => {
    const plan = computeMigrationPlan({
      direction: 'up',
      targetVersion: '1.0.0',
      targetFile: 'seed-admin.js',
      applied: [],
      discovered
    })
    assert.deepEqual(plan, [{ version: '1.0.0', file: 'seed-admin.js' }])
  })

  it('returns an empty plan when everything up to the target version is already applied', () => {
    const plan = computeMigrationPlan({
      direction: 'up',
      targetVersion: '1.0.0',
      applied: [
        { version: '1.0.0', file: 'create-users.js' },
        { version: '1.0.0', file: 'seed-admin.js' }
      ],
      discovered
    })
    assert.deepEqual(plan, [])
  })

  it('throws on an invalid target version', () => {
    assert.throws(
      () => computeMigrationPlan({ direction: 'up', targetVersion: 'not-a-version', applied: [], discovered }),
      /invalid semver/i
    )
  })
})

describe('computeMigrationPlan down', () => {
  const applied = [
    { version: '1.0.0', file: 'create-users.js' },
    { version: '1.0.0', file: 'seed-admin.js' },
    { version: '1.2.0', file: 'add-user-email-index.js' },
    { version: '2.0.0', file: 'add-orders-collection.js' }
  ]

  it('rolls back every applied migration from the target version upward, ordered descending', () => {
    const plan = computeMigrationPlan({ direction: 'down', targetVersion: '1.0.0', applied, discovered })
    assert.deepEqual(plan, [
      { version: '2.0.0', file: 'add-orders-collection.js' },
      { version: '1.2.0', file: 'add-user-email-index.js' },
      { version: '1.0.0', file: 'seed-admin.js' },
      { version: '1.0.0', file: 'create-users.js' }
    ])
  })

  it('rolls back the target version itself, leaving only migrations below it untouched', () => {
    const plan = computeMigrationPlan({ direction: 'down', targetVersion: '1.2.0', applied, discovered })
    assert.deepEqual(plan, [
      { version: '2.0.0', file: 'add-orders-collection.js' },
      { version: '1.2.0', file: 'add-user-email-index.js' }
    ])
  })

  it('narrows to a single applied file within the target version when targetFile is given', () => {
    const plan = computeMigrationPlan({
      direction: 'down',
      targetVersion: '1.0.0',
      targetFile: 'seed-admin.js',
      applied,
      discovered
    })
    assert.deepEqual(plan, [{ version: '1.0.0', file: 'seed-admin.js' }])
  })

  it('returns an empty plan when nothing is applied at or above the target version', () => {
    const plan = computeMigrationPlan({ direction: 'down', targetVersion: '3.0.0', applied, discovered })
    assert.deepEqual(plan, [])
  })

  it('throws on an invalid target version', () => {
    assert.throws(
      () => computeMigrationPlan({ direction: 'down', targetVersion: 'not-a-version', applied, discovered }),
      /invalid semver/i
    )
  })
})
