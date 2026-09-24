import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { CONFIG_FILE_NAME, loadConfig, resolveMongoUri } from '#Config/load-config'

describe('loadConfig', () => {
  let dir = ''

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mongo-updown-load-config-'))
  })

  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('loads and validates a CommonJS-style config file', async () => {
    await writeFile(
      join(dir, CONFIG_FILE_NAME),
      "module.exports = { phases: true, mongoUri: { fromEnv: 'MONGO_URI' }, migrationsDir: './migrations', stateCollection: 'x' }\n"
    )
    const config = await loadConfig(dir)
    assert.deepEqual(config, {
      phases: true,
      mongoUri: { fromEnv: 'MONGO_URI' },
      migrationsDir: './migrations',
      stateCollection: 'x'
    })
  })

  it('loads and validates a config file with phases: false', async () => {
    const phaselessDir = await mkdtemp(join(tmpdir(), 'mongo-updown-load-config-phaseless-'))
    await writeFile(
      join(phaselessDir, CONFIG_FILE_NAME),
      "module.exports = { phases: false, mongoUri: { fromEnv: 'MONGO_URI' }, migrationsDir: './migrations', stateCollection: 'x' }\n"
    )
    const config = await loadConfig(phaselessDir)
    assert.deepEqual(config, {
      phases: false,
      mongoUri: { fromEnv: 'MONGO_URI' },
      migrationsDir: './migrations',
      stateCollection: 'x'
    })
    await rm(phaselessDir, { recursive: true, force: true })
  })

  it('throws when the config file does not exist', async () => {
    await assert.rejects(loadConfig(join(dir, 'does-not-exist')), /not found/i)
  })

  it('throws when the config file does not match the expected shape', async () => {
    const badDir = await mkdtemp(join(tmpdir(), 'mongo-updown-load-config-bad-'))
    await writeFile(join(badDir, CONFIG_FILE_NAME), 'module.exports = { nope: true }\n')
    await assert.rejects(loadConfig(badDir), /invalid/i)
    await rm(badDir, { recursive: true, force: true })
  })

  it('throws when the config file is missing phases', async () => {
    const badDir = await mkdtemp(join(tmpdir(), 'mongo-updown-load-config-missing-phases-'))
    await writeFile(
      join(badDir, CONFIG_FILE_NAME),
      "module.exports = { mongoUri: { fromEnv: 'MONGO_URI' }, migrationsDir: './migrations', stateCollection: 'x' }\n"
    )
    await assert.rejects(loadConfig(badDir), /invalid/i)
    await rm(badDir, { recursive: true, force: true })
  })
})

describe('resolveMongoUri', () => {
  it('reads the connection string from an environment variable', async () => {
    process.env.MONGO_UPDOWN_TEST_URI = 'mongodb://from-env/'
    try {
      const uri = await resolveMongoUri({ fromEnv: 'MONGO_UPDOWN_TEST_URI' }, process.cwd())
      assert.equal(uri, 'mongodb://from-env/')
    } finally {
      delete process.env.MONGO_UPDOWN_TEST_URI
    }
  })

  it('throws when the environment variable is not set', async () => {
    await assert.rejects(resolveMongoUri({ fromEnv: 'MONGO_UPDOWN_DOES_NOT_EXIST' }, process.cwd()), /not set/i)
  })

  it('reads the connection string from a file, trimmed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mongo-updown-uri-file-'))
    try {
      await writeFile(join(dir, '.mongo-updown-uri'), 'mongodb://from-file/\n')
      const uri = await resolveMongoUri({ fromFile: './.mongo-updown-uri' }, dir)
      assert.equal(uri, 'mongodb://from-file/')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
