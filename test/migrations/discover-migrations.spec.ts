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
    const migrations = await discoverMigrations(dir)
    const sorted = [...migrations].sort(
      (a, b) => a.version.localeCompare(b.version) || a.phase.localeCompare(b.phase) || a.file.localeCompare(b.file)
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
    const migrations = await discoverMigrations(dir)
    const migration = migrations.find((m) => m.file === 'add-orders.js')
    assert.equal(migration?.filePath, join(dir, '2.0.0', 'post', 'add-orders.js'))
  })

  it('throws when the migrations directory does not exist', async () => {
    await assert.rejects(discoverMigrations(join(dir, 'does-not-exist')), /migrations directory/i)
  })

  it('throws when a version directory name is not valid semver', async () => {
    const badDir = await mkdtemp(join(tmpdir(), 'mongo-updown-discover-bad-'))
    await mkdir(join(badDir, 'wip'))
    await assert.rejects(discoverMigrations(badDir), /invalid semver/i)
    await rm(badDir, { recursive: true, force: true })
  })

  it('throws when a .js migration sits directly in a version directory, outside a phase directory', async () => {
    const badDir = await mkdtemp(join(tmpdir(), 'mongo-updown-discover-unphased-'))
    await mkdir(join(badDir, '1.0.0'))
    await writeFile(join(badDir, '1.0.0', 'create-users.js'), '')
    await assert.rejects(discoverMigrations(badDir), /"create-users\.js".*1\.0\.0.*"pre\/" or "post\/"/)
    await rm(badDir, { recursive: true, force: true })
  })

  it('throws when a version directory contains a subdirectory other than pre/post', async () => {
    const badDir = await mkdtemp(join(tmpdir(), 'mongo-updown-discover-unknown-phase-'))
    await mkdir(join(badDir, '1.0.0', 'during'), { recursive: true })
    await assert.rejects(discoverMigrations(badDir), /"during".*1\.0\.0.*"pre" or "post"/)
    await rm(badDir, { recursive: true, force: true })
  })
})
