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
    await mkdir(join(dir, '1.0.0'))
    await writeFile(join(dir, '1.0.0', 'create-users.js'), '')
    await writeFile(join(dir, '1.0.0', 'seed-admin.js'), '')
    await writeFile(join(dir, '1.0.0', 'notes.txt'), '')
    await mkdir(join(dir, '2.0.0'))
    await writeFile(join(dir, '2.0.0', 'add-orders.js'), '')
    await writeFile(join(dir, 'README.md'), '')
  })

  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('discovers .js migration files grouped by version directory', async () => {
    const migrations = await discoverMigrations(dir)
    const sorted = [...migrations].sort((a, b) => a.version.localeCompare(b.version) || a.file.localeCompare(b.file))
    assert.deepEqual(
      sorted.map((migration) => ({ version: migration.version, file: migration.file })),
      [
        { version: '1.0.0', file: 'create-users.js' },
        { version: '1.0.0', file: 'seed-admin.js' },
        { version: '2.0.0', file: 'add-orders.js' }
      ]
    )
  })

  it('includes the absolute file path for each migration', async () => {
    const migrations = await discoverMigrations(dir)
    const migration = migrations.find((m) => m.file === 'add-orders.js')
    assert.equal(migration?.filePath, join(dir, '2.0.0', 'add-orders.js'))
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
})
