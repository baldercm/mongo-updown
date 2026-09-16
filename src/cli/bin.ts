#!/usr/bin/env node
import { runDownCommand } from '#Cli/commands/down-command'
import { runInitCommand } from '#Cli/commands/init-command'
import { runUpCommand } from '#Cli/commands/up-command'
import { parseCliArgs } from '#Cli/dispatch'
import { consoleLogger } from '#Common/logger'

async function main(): Promise<void> {
  const command = parseCliArgs(process.argv.slice(2))
  const cwd = process.cwd()

  if (command.kind === 'init') {
    await runInitCommand({ cwd, force: command.force }, consoleLogger)
    return
  }

  if (command.kind === 'up') {
    await runUpCommand({ cwd, targetVersion: command.targetVersion, targetFile: command.targetFile }, consoleLogger)
    return
  }

  await runDownCommand({ cwd, targetVersion: command.targetVersion, targetFile: command.targetFile }, consoleLogger)
}

main().catch((error: unknown) => {
  consoleLogger.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
