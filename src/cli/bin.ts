#!/usr/bin/env node
import { readFileSync } from 'node:fs'

import { runDownCommand } from '#Cli/commands/down-command'
import { runInitCommand } from '#Cli/commands/init-command'
import { runUpCommand } from '#Cli/commands/up-command'
import { parseCliArgs } from '#Cli/dispatch'
import { consoleLogger } from '#Common/logger'

const HELP_TEXT = `Usage: mongo-updown <command> [options]

Commands:
  init [--force]                              Write mongo-updown.config.js and create the migrations directory
  up <version> <file?> --phase <pre|post>     Apply pending <phase> migrations up to and including <version>
  down <version> <file?> --phase <pre|post>   Roll back applied <phase> migrations from <version> upward

  Phases: "pre" runs before deploying the application, "post" runs after it.

Options:
  -h, --help      Show this help message
  -v, --version   Show the installed version
`

function readPackageVersion(): string {
  const packageJsonPath = new URL('../../package.json', import.meta.url)
  const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string }
  return version
}

async function main(): Promise<void> {
  const command = parseCliArgs(process.argv.slice(2))
  const cwd = process.cwd()

  if (command.kind === 'help') {
    process.stdout.write(HELP_TEXT)
    return
  }

  if (command.kind === 'version') {
    process.stdout.write(`${readPackageVersion()}\n`)
    return
  }

  if (command.kind === 'init') {
    await runInitCommand({ cwd, force: command.force }, consoleLogger)
    return
  }

  if (command.kind === 'up') {
    await runUpCommand(
      { cwd, targetVersion: command.targetVersion, targetFile: command.targetFile, phase: command.phase },
      consoleLogger
    )
    return
  }

  if (command.kind === 'down') {
    await runDownCommand(
      { cwd, targetVersion: command.targetVersion, targetFile: command.targetFile, phase: command.phase },
      consoleLogger
    )
    return
  }
}

main().catch((error: unknown) => {
  consoleLogger.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
