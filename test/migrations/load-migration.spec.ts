import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import type { Db, MongoClient } from 'mongodb'

import type { MigrationContext } from '#Migrations/load-migration'
import { loadMigration } from '#Migrations/load-migration'

const fakeContext: MigrationContext = { db: {} as Db, client: {} as MongoClient, session: undefined }

describe('loadMigration', () => {
  let dir = ''

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mongo-updown-load-migration-'))
  })

  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('loads a CommonJS migration exported as module.exports = { up, down }', async () => {
    const filePath = join(dir, 'object-export.cjs')
    await writeFile(filePath, 'module.exports = { up: async () => "up", down: async () => "down" }\n')
    const migration = await loadMigration(filePath)
    assert.equal(await migration.up(fakeContext), 'up')
    assert.equal(await migration.down(fakeContext), 'down')
    assert.equal(migration.transaction, false)
  })

  it('loads a CommonJS migration exported as named exports.up/exports.down', async () => {
    const filePath = join(dir, 'named-export.cjs')
    await writeFile(filePath, 'exports.up = async () => "up"\nexports.down = async () => "down"\n')
    const migration = await loadMigration(filePath)
    assert.equal(await migration.up(fakeContext), 'up')
    assert.equal(await migration.down(fakeContext), 'down')
    assert.equal(migration.transaction, false)
  })

  it('loads an ES module migration exported as named export const up/down', async () => {
    const filePath = join(dir, 'esm.mjs')
    await writeFile(filePath, 'export const up = async () => "up"\nexport const down = async () => "down"\n')
    const migration = await loadMigration(filePath)
    assert.equal(await migration.up(fakeContext), 'up')
    assert.equal(await migration.down(fakeContext), 'down')
    assert.equal(migration.transaction, false)
  })

  it('passes the context object through to up and down', async () => {
    const filePath = join(dir, 'context.cjs')
    await writeFile(filePath, 'exports.up = async (ctx) => ctx\nexports.down = async (ctx) => ctx\n')
    const migration = await loadMigration(filePath)
    assert.equal(await migration.up(fakeContext), fakeContext)
    assert.equal(await migration.down(fakeContext), fakeContext)
  })

  it('reads transaction = true from a CommonJS named export', async () => {
    const filePath = join(dir, 'transaction-named.cjs')
    await writeFile(
      filePath,
      'exports.transaction = true\nexports.up = async () => {}\nexports.down = async () => {}\n'
    )
    assert.equal((await loadMigration(filePath)).transaction, true)
  })

  it('reads transaction = true from an ES module named export', async () => {
    const filePath = join(dir, 'transaction-esm.mjs')
    await writeFile(
      filePath,
      'export const transaction = true\nexport const up = async () => {}\nexport const down = async () => {}\n'
    )
    assert.equal((await loadMigration(filePath)).transaction, true)
  })

  it('reads transaction = true from a default export object', async () => {
    const filePath = join(dir, 'transaction-default.mjs')
    await writeFile(filePath, 'export default { transaction: true, up: async () => {}, down: async () => {} }\n')
    assert.equal((await loadMigration(filePath)).transaction, true)
  })

  it('throws when transaction is exported with a non-boolean value', async () => {
    const filePath = join(dir, 'transaction-invalid.cjs')
    await writeFile(
      filePath,
      'exports.transaction = "yes"\nexports.up = async () => {}\nexports.down = async () => {}\n'
    )
    await assert.rejects(loadMigration(filePath), /transaction.*must be a boolean/i)
  })

  it('throws when the file does not export both up and down', async () => {
    const filePath = join(dir, 'missing-down.cjs')
    await writeFile(filePath, 'exports.up = async () => "up"\n')
    await assert.rejects(loadMigration(filePath), /must export up\(context\) and down\(context\)/i)
  })
})
