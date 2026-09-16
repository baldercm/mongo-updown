import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isMongoUpdownConfig } from '#Config/config-schema'

describe('isMongoUpdownConfig', () => {
  it('accepts a valid config with a fromEnv mongoUri', () => {
    assert.equal(
      isMongoUpdownConfig({
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
        mongoUri: { fromFile: './.mongo-updown-uri' },
        migrationsDir: './migrations',
        stateCollection: 'mongo_updown_migrations'
      }),
      true
    )
  })

  it('rejects a config missing mongoUri', () => {
    assert.equal(isMongoUpdownConfig({ migrationsDir: './migrations', stateCollection: 'x' }), false)
  })

  it('rejects a mongoUri with neither fromEnv nor fromFile', () => {
    assert.equal(isMongoUpdownConfig({ mongoUri: {}, migrationsDir: './migrations', stateCollection: 'x' }), false)
  })

  it('rejects a config with a non-string migrationsDir', () => {
    assert.equal(isMongoUpdownConfig({ mongoUri: { fromEnv: 'X' }, migrationsDir: 42, stateCollection: 'x' }), false)
  })

  it('rejects null and non-object values', () => {
    assert.equal(isMongoUpdownConfig(null), false)
    assert.equal(isMongoUpdownConfig('not a config'), false)
  })
})
