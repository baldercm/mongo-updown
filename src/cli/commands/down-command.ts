import { isAbsolute, join } from 'node:path'

import type { Logger } from '#Common/logger'
import { runSequentially } from '#Common/sequential'
import { loadConfig, resolveMongoUri } from '#Config/load-config'
import { connect } from '#Db/connect'
import { removeAppliedMigration, getAppliedMigrations } from '#Db/migration-state-store'
import { discoverMigrations } from '#Migrations/discover-migrations'
import { loadMigration } from '#Migrations/load-migration'
import { computeMigrationPlan } from '#Migrations/migration-plan'

export interface RunDownCommandOptions {
  readonly cwd: string
  readonly targetVersion: string
  readonly targetFile?: string
}

export async function runDownCommand(options: RunDownCommandOptions, logger: Logger): Promise<void> {
  const { cwd, targetVersion, targetFile } = options
  const config = await loadConfig(cwd)
  const mongoUri = await resolveMongoUri(config.mongoUri, cwd)
  const migrationsDir = isAbsolute(config.migrationsDir) ? config.migrationsDir : join(cwd, config.migrationsDir)

  const { client, db } = await connect(mongoUri)
  try {
    const [applied, discovered] = await Promise.all([
      getAppliedMigrations(db, config.stateCollection),
      discoverMigrations(migrationsDir)
    ])
    const plan = computeMigrationPlan({ direction: 'down', targetVersion, targetFile, applied, discovered })

    if (plan.length === 0) {
      logger.info('Nothing to do.')
      return
    }

    await runSequentially(plan, async (migrationRef) => {
      const discoveredMigration = discovered.find(
        (m) => m.version === migrationRef.version && m.file === migrationRef.file
      )
      if (!discoveredMigration) {
        throw new Error(`Migration "${migrationRef.file}" for version ${migrationRef.version} was not found on disk.`)
      }
      logger.info(`Rolling back ${migrationRef.version}/${migrationRef.file}...`)
      const migration = await loadMigration(discoveredMigration.filePath)
      await migration.down(db, client)
      await removeAppliedMigration(db, config.stateCollection, migrationRef)
    })
    logger.info(`Rolled back ${String(plan.length)} migration(s).`)
  } finally {
    await client.close()
  }
}
