import type { RunMigrationCommandOptions } from '#Cli/commands/run-migration-command'
import { runMigrationCommand } from '#Cli/commands/run-migration-command'
import type { Logger } from '#Common/logger'
import { recordMigrationUp } from '#Db/migration-state-store'

export type RunUpCommandOptions = RunMigrationCommandOptions

export async function runUpCommand(options: RunUpCommandOptions, logger: Logger): Promise<void> {
  await runMigrationCommand(options, logger, {
    direction: 'up',
    stepVerb: 'Applying',
    doneVerb: 'Applied',
    applyMigration: (migration, db, client) => migration.up(db, client),
    updateState: recordMigrationUp
  })
}
