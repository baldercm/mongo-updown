import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import type { Db, MongoClient } from 'mongodb'

import { loadMigration } from '#Migrations/load-migration'

const fakeDb = {} as Db
const fakeClient = {} as MongoClient

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
    assert.equal(await migration.up(fakeDb, fakeClient), 'up')
    assert.equal(await migration.down(fakeDb, fakeClient), 'down')
  })

  it('loads a CommonJS migration exported as named exports.up/exports.down', async () => {
    const filePath = join(dir, 'named-export.cjs')
    await writeFile(filePath, 'exports.up = async () => "up"\nexports.down = async () => "down"\n')
    const migration = await loadMigration(filePath)
    assert.equal(await migration.up(fakeDb, fakeClient), 'up')
    assert.equal(await migration.down(fakeDb, fakeClient), 'down')
  })

  it('loads an ES module migration exported as named export const up/down', async () => {
    const filePath = join(dir, 'esm.mjs')
    await writeFile(filePath, 'export const up = async () => "up"\nexport const down = async () => "down"\n')
    const migration = await loadMigration(filePath)
    assert.equal(await migration.up(fakeDb, fakeClient), 'up')
    assert.equal(await migration.down(fakeDb, fakeClient), 'down')
  })

  it('throws when the file does not export both up and down', async () => {
    const filePath = join(dir, 'missing-down.cjs')
    await writeFile(filePath, 'exports.up = async () => "up"\n')
    await assert.rejects(loadMigration(filePath), /must export up\(db, client\) and down\(db, client\)/i)
  })
})
