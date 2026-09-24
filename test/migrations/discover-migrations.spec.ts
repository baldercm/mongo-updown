import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { discoverMigrations } from '#Migrations/discover-migrations'

describe('discoverMigrations', () => {
  let dir = ''

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mongo-updown-discover-'))
    await mkdir(join(dir, '1.0.0', 'pre'), { recursive: true })
    await mkdir(join(dir, '1.0.0', 'post'), { recursive: true })
    await writeFile(join(dir, '1.0.0', 'pre', 'create-users.js'), '')
    await writeFile(join(dir, '1.0.0', 'pre', 'seed-admin.js'), '')
    await writeFile(join(dir, '1.0.0', 'pre', 'notes.txt'), '')
    await writeFile(join(dir, '1.0.0', 'post', 'seed-admin.js'), '')
    await writeFile(join(dir, '1.0.0', 'notes.txt'), '')
    await mkdir(join(dir, '2.0.0', 'post'), { recursive: true })
    await writeFile(join(dir, '2.0.0', 'post', 'add-orders.js'), '')
    await writeFile(join(dir, 'README.md'), '')
  })

  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('discovers .js migration files grouped by version and phase directory, ignoring other files', async () => {
    const migrations = await discoverMigrations(dir, { phases: true })
    const sorted = [...migrations].sort(
      (a, b) =>
        a.version.localeCompare(b.version) ||
        (a.phase ?? '').localeCompare(b.phase ?? '') ||
        a.file.localeCompare(b.file)
    )
    assert.deepEqual(
      sorted.map((migration) => ({ version: migration.version, phase: migration.phase, file: migration.file })),
      [
        { version: '1.0.0', phase: 'post', file: 'seed-admin.js' },
        { version: '1.0.0', phase: 'pre', file: 'create-users.js' },
        { version: '1.0.0', phase: 'pre', file: 'seed-admin.js' },
        { version: '2.0.0', phase: 'post', file: 'add-orders.js' }
      ]
    )
  })

  it('includes the absolute file path for each migration, including its phase directory', async () => {
    const migrations = await discoverMigrations(dir, { phases: true })
    const migration = migrations.find((m) => m.file === 'add-orders.js')
    assert.equal(migration?.filePath, join(dir, '2.0.0', 'post', 'add-orders.js'))
  })

  it('throws when the migrations directory does not exist', async () => {
    await assert.rejects(discoverMigrations(join(dir, 'does-not-exist'), { phases: true }), /migrations directory/i)
  })

  it('throws when a version directory name is not valid semver', async () => {
    const badDir = await mkdtemp(join(tmpdir(), 'mongo-updown-discover-bad-'))
    await mkdir(join(badDir, 'wip'))
    await assert.rejects(discoverMigrations(badDir, { phases: true }), /invalid semver/i)
    await rm(badDir, { recursive: true, force: true })
  })

  it('throws when a .js migration sits directly in a version directory, outside a phase directory', async () => {
    const badDir = await mkdtemp(join(tmpdir(), 'mongo-updown-discover-unphased-'))
    await mkdir(join(badDir, '1.0.0'))
    await writeFile(join(badDir, '1.0.0', 'create-users.js'), '')
    await assert.rejects(
      discoverMigrations(badDir, { phases: true }),
      /"create-users\.js".*1\.0\.0.*"pre\/" or "post\/"/
    )
    await rm(badDir, { recursive: true, force: true })
  })

  it('throws when a version directory contains a subdirectory other than pre/post', async () => {
    const badDir = await mkdtemp(join(tmpdir(), 'mongo-updown-discover-unknown-phase-'))
    await mkdir(join(badDir, '1.0.0', 'during'), { recursive: true })
    await assert.rejects(discoverMigrations(badDir, { phases: true }), /"during".*1\.0\.0.*"pre" or "post"/)
    await rm(badDir, { recursive: true, force: true })
  })
})

describe('discoverMigrations phaseless (phases: false)', () => {
  let flatDir = ''

  before(async () => {
    flatDir = await mkdtemp(join(tmpdir(), 'mongo-updown-discover-flat-'))
    await mkdir(join(flatDir, '1.0.0'), { recursive: true })
    await writeFile(join(flatDir, '1.0.0', 'create-users.js'), '')
    await writeFile(join(flatDir, '1.0.0', 'seed-admin.js'), '')
    await writeFile(join(flatDir, '1.0.0', 'notes.txt'), '')
    await mkdir(join(flatDir, '2.0.0'), { recursive: true })
    await writeFile(join(flatDir, '2.0.0', 'add-orders.js'), '')
  })

  after(async () => {
    await rm(flatDir, { recursive: true, force: true })
  })

  it('discovers .js files directly under each version directory, ignoring other files, with no phase key', async () => {
    const migrations = await discoverMigrations(flatDir, { phases: false })
    const sorted = [...migrations].sort((a, b) => a.version.localeCompare(b.version) || a.file.localeCompare(b.file))
    assert.deepEqual(
      sorted.map((migration) => ({ version: migration.version, file: migration.file })),
      [
        { version: '1.0.0', file: 'create-users.js' },
        { version: '1.0.0', file: 'seed-admin.js' },
        { version: '2.0.0', file: 'add-orders.js' }
      ]
    )
    assert.equal(
      sorted.every((migration) => !('phase' in migration)),
      true
    )
  })

  it('includes the absolute file path for each migration', async () => {
    const migrations = await discoverMigrations(flatDir, { phases: false })
    const migration = migrations.find((m) => m.file === 'add-orders.js')
    assert.equal(migration?.filePath, join(flatDir, '2.0.0', 'add-orders.js'))
  })

  it('throws when a version directory contains any subdirectory, including one named pre or post', async () => {
    const badDir = await mkdtemp(join(tmpdir(), 'mongo-updown-discover-flat-subdir-'))
    await mkdir(join(badDir, '1.0.0', 'pre'), { recursive: true })
    await assert.rejects(discoverMigrations(badDir, { phases: false }), /"pre".*1\.0\.0.*phases: false/)
    await rm(badDir, { recursive: true, force: true })
  })

  it('throws when a version directory name is not valid semver', async () => {
    const badDir = await mkdtemp(join(tmpdir(), 'mongo-updown-discover-flat-bad-version-'))
    await mkdir(join(badDir, 'wip'))
    await assert.rejects(discoverMigrations(badDir, { phases: false }), /invalid semver/i)
    await rm(badDir, { recursive: true, force: true })
  })

  it('throws when the migrations directory does not exist', async () => {
    await assert.rejects(
      discoverMigrations(join(flatDir, 'does-not-exist'), { phases: false }),
      /migrations directory/i
    )
  })
})
