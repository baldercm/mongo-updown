import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const BIN_PATH = join(import.meta.dirname, '..', '..', 'src', 'cli', 'bin.ts')
const PACKAGE_JSON_PATH = join(import.meta.dirname, '..', '..', 'package.json')

async function runCli(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', ['--conditions=development', BIN_PATH, ...args], { cwd })
    return { stdout, stderr, code: 0 }
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; code?: number }
    return { stdout: execError.stdout ?? '', stderr: execError.stderr ?? '', code: execError.code ?? 1 }
  }
}

describe('mongo-updown CLI', () => {
  let dir = ''

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mongo-updown-bin-'))
  })

  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('prints usage and exits 0 for "--help"', async () => {
    const result = await runCli(['--help'], dir)
    assert.equal(result.code, 0)
    assert.match(result.stdout, /usage/i)
  })

  it('documents the required --phase option in the usage text', async () => {
    const result = await runCli(['--help'], dir)
    assert.match(result.stdout, /up <version> <file\?> --phase <pre\|post>/)
    assert.match(result.stdout, /down <version> <file\?> --phase <pre\|post>/)
  })

  it('exits non-zero with a usage message when up is run without --phase', async () => {
    const result = await runCli(['up', '1.0.0'], dir)
    assert.equal(result.code, 1)
    assert.match(result.stderr, /usage.*--phase <pre\|post>/i)
  })

  it('prints usage and exits 0 for "-h"', async () => {
    const result = await runCli(['-h'], dir)
    assert.equal(result.code, 0)
    assert.match(result.stdout, /usage/i)
  })

  it('prints the installed version and exits 0 for "--version"', async () => {
    const { version } = JSON.parse(await readFile(PACKAGE_JSON_PATH, 'utf8')) as { version: string }
    const result = await runCli(['--version'], dir)
    assert.equal(result.code, 0)
    assert.equal(result.stdout.trim(), version)
  })

  it('prints the installed version and exits 0 for "-v"', async () => {
    const { version } = JSON.parse(await readFile(PACKAGE_JSON_PATH, 'utf8')) as { version: string }
    const result = await runCli(['-v'], dir)
    assert.equal(result.code, 0)
    assert.equal(result.stdout.trim(), version)
  })

  it('runs "init" and writes a config file', async () => {
    const result = await runCli(['init'], dir)
    assert.equal(result.code, 0)
    const content = await readFile(join(dir, 'mongo-updown.config.js'), 'utf8')
    assert.match(content, /module\.exports/)
  })

  it('exits non-zero with a message for an unknown command', async () => {
    const result = await runCli(['frobnicate'], dir)
    assert.equal(result.code, 1)
    assert.match(result.stderr, /unknown command/i)
  })
})
