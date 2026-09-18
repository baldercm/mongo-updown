import type { RunMigrationCommandOptions } from '#Cli/commands/run-migration-command'
import { runMigrationCommand } from '#Cli/commands/run-migration-command'
import type { Logger } from '#Common/logger'
import { recordMigrationDown } from '#Db/migration-state-store'

export type RunDownCommandOptions = RunMigrationCommandOptions

export async function runDownCommand(options: RunDownCommandOptions, logger: Logger): Promise<void> {
  await runMigrationCommand(options, logger, {
    direction: 'down',
    stepVerb: 'Rolling back',
    doneVerb: 'Rolled back',
    applyMigration: (migration, db, client) => migration.down(db, client),
    updateState: recordMigrationDown
  })
}
