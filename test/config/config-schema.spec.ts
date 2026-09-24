import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isMongoUpdownConfig } from '#Config/config-schema'

describe('isMongoUpdownConfig', () => {
  it('accepts a valid config with a fromEnv mongoUri', () => {
    assert.equal(
      isMongoUpdownConfig({
        phases: true,
        mongoUri: { fromEnv: 'MONGO_URI' },
        migrationsDir: './migrations',
        stateCollection: 'mongo_updown_migrations'
      }),
      true
    )
  })

  it('accepts a valid config with a fromFile mongoUri', () => {
    assert.equal(
      isMongoUpdownConfig({
        phases: true,
        mongoUri: { fromFile: './.mongo-updown-uri' },
        migrationsDir: './migrations',
        stateCollection: 'mongo_updown_migrations'
      }),
      true
    )
  })

  it('accepts a valid config with phases: false', () => {
    assert.equal(
      isMongoUpdownConfig({
        phases: false,
        mongoUri: { fromEnv: 'MONGO_URI' },
        migrationsDir: './migrations',
        stateCollection: 'mongo_updown_migrations'
      }),
      true
    )
  })

  it('rejects a config missing mongoUri', () => {
    assert.equal(isMongoUpdownConfig({ phases: true, migrationsDir: './migrations', stateCollection: 'x' }), false)
  })

  it('rejects a mongoUri with neither fromEnv nor fromFile', () => {
    assert.equal(
      isMongoUpdownConfig({ phases: true, mongoUri: {}, migrationsDir: './migrations', stateCollection: 'x' }),
      false
    )
  })

  it('rejects a config with a non-string migrationsDir', () => {
    assert.equal(
      isMongoUpdownConfig({ phases: true, mongoUri: { fromEnv: 'X' }, migrationsDir: 42, stateCollection: 'x' }),
      false
    )
  })

  it('rejects a config missing phases', () => {
    assert.equal(
      isMongoUpdownConfig({ mongoUri: { fromEnv: 'X' }, migrationsDir: './migrations', stateCollection: 'x' }),
      false
    )
  })

  it('rejects a config with a non-boolean phases', () => {
    assert.equal(
      isMongoUpdownConfig({
        phases: 'true',
        mongoUri: { fromEnv: 'X' },
        migrationsDir: './migrations',
        stateCollection: 'x'
      }),
      false
    )
  })

  it('rejects null and non-object values', () => {
    assert.equal(isMongoUpdownConfig(null), false)
    assert.equal(isMongoUpdownConfig('not a config'), false)
  })
})
