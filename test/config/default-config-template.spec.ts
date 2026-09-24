import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { pathToFileURL } from 'node:url'

import { isMongoUpdownConfig } from '#Config/config-schema'
import { buildDefaultConfigContent } from '#Config/default-config-template'

describe('buildDefaultConfigContent', () => {
  let dir = ''

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mongo-updown-config-template-'))
  })

  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('produces a CommonJS module that resolves to a valid config', async () => {
    const filePath = join(dir, 'commonjs.js')
    await writeFile(filePath, buildDefaultConfigContent('commonjs', true))
    const imported = (await import(pathToFileURL(filePath).href)) as { default?: unknown }
    assert.equal(isMongoUpdownConfig(imported.default), true)
    assert.deepEqual(imported.default, {
      phases: true,
      mongoUri: { fromEnv: 'MONGO_URI' },
      migrationsDir: './migrations',
      stateCollection: 'mongo_updown_migrations'
    })
  })

  it('produces an ES module that resolves to a valid config', async () => {
    const filePath = join(dir, 'esm.mjs')
    await writeFile(filePath, buildDefaultConfigContent('module', true))
    const imported = (await import(pathToFileURL(filePath).href)) as { default?: unknown }
    assert.equal(isMongoUpdownConfig(imported.default), true)
    assert.deepEqual(imported.default, {
      phases: true,
      mongoUri: { fromEnv: 'MONGO_URI' },
      migrationsDir: './migrations',
      stateCollection: 'mongo_updown_migrations'
    })
  })

  it('embeds phases: false when requested', async () => {
    const filePath = join(dir, 'phaseless.js')
    await writeFile(filePath, buildDefaultConfigContent('commonjs', false))
    const imported = (await import(pathToFileURL(filePath).href)) as { default?: unknown }
    assert.equal(isMongoUpdownConfig(imported.default), true)
    assert.deepEqual(imported.default, {
      phases: false,
      mongoUri: { fromEnv: 'MONGO_URI' },
      migrationsDir: './migrations',
      stateCollection: 'mongo_updown_migrations'
    })
  })
})
