import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { detectHostModuleType } from '#Config/host-module-type'

describe('detectHostModuleType', () => {
  let dir = ''

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mongo-updown-host-module-type-'))
  })

  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns "module" when package.json declares "type": "module"', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
    assert.equal(await detectHostModuleType(dir), 'module')
  })

  it('returns "commonjs" when package.json declares "type": "commonjs"', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'commonjs' }))
    assert.equal(await detectHostModuleType(dir), 'commonjs')
  })

  it('returns "commonjs" when package.json has no "type" field', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'x' }))
    assert.equal(await detectHostModuleType(dir), 'commonjs')
  })

  it('returns "commonjs" when there is no package.json at all', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'mongo-updown-host-module-type-empty-'))
    assert.equal(await detectHostModuleType(emptyDir), 'commonjs')
    await rm(emptyDir, { recursive: true, force: true })
  })
})
