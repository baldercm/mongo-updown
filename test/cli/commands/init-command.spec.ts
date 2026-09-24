import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { runInitCommand } from '#Cli/commands/init-command'
import type { Logger } from '#Common/logger'
import { CONFIG_FILE_NAME } from '#Config/load-config'

function createSilentLogger(): Logger {
  return { info: () => undefined, step: () => undefined, success: () => undefined, error: () => undefined }
}

describe('runInitCommand', () => {
  let dir = ''

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mongo-updown-init-command-'))
  })

  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes the default config file and creates the migrations directory', async () => {
    await runInitCommand({ cwd: dir, force: false, phases: true }, createSilentLogger())
    const content = await readFile(join(dir, CONFIG_FILE_NAME), 'utf8')
    assert.match(content, /module\.exports/)
    assert.match(content, /phases: true/)
    const migrationsDirStat = await stat(join(dir, 'migrations'))
    assert.equal(migrationsDirStat.isDirectory(), true)
  })

  it('refuses to overwrite an existing config file without --force', async () => {
    await assert.rejects(
      runInitCommand({ cwd: dir, force: false, phases: true }, createSilentLogger()),
      /already exists/i
    )
  })

  it('overwrites an existing config file when force is true', async () => {
    await writeFile(join(dir, CONFIG_FILE_NAME), '// stale\n')
    await runInitCommand({ cwd: dir, force: true, phases: true }, createSilentLogger())
    const content = await readFile(join(dir, CONFIG_FILE_NAME), 'utf8')
    assert.doesNotMatch(content, /stale/)
  })

  it('generates ES module syntax when the host project declares "type": "module"', async () => {
    const esmDir = await mkdtemp(join(tmpdir(), 'mongo-updown-init-command-esm-'))
    await writeFile(join(esmDir, 'package.json'), JSON.stringify({ type: 'module' }))
    await runInitCommand({ cwd: esmDir, force: false, phases: true }, createSilentLogger())
    const content = await readFile(join(esmDir, CONFIG_FILE_NAME), 'utf8')
    assert.match(content, /export default/)
    await rm(esmDir, { recursive: true, force: true })
  })

  it('writes phases: false when requested', async () => {
    const phaselessDir = await mkdtemp(join(tmpdir(), 'mongo-updown-init-command-phaseless-'))
    await runInitCommand({ cwd: phaselessDir, force: false, phases: false }, createSilentLogger())
    const content = await readFile(join(phaselessDir, CONFIG_FILE_NAME), 'utf8')
    assert.match(content, /phases: false/)
    await rm(phaselessDir, { recursive: true, force: true })
  })
})
