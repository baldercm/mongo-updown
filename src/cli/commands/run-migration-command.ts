import { isAbsolute, join } from 'node:path'

import type { Db, MongoClient } from 'mongodb'

import type { Logger } from '#Common/logger'
import { loadConfig, resolveMongoUri } from '#Config/load-config'
import { connect } from '#Db/connect'
import { getAppliedMigrations } from '#Db/migration-state-store'
import { discoverMigrations } from '#Migrations/discover-migrations'
import type { LoadedMigration } from '#Migrations/load-migration'
import { loadMigration } from '#Migrations/load-migration'
import { computeMigrationPlan } from '#Migrations/migration-plan'
import type { MigrationDirection, MigrationPhase, MigrationRef } from '#Migrations/migration-plan'

export interface RunMigrationCommandOptions {
  readonly cwd: string
  readonly targetVersion: string
  readonly targetFile?: string
  readonly phase: MigrationPhase
}

export interface MigrationCommandStrategy {
  readonly direction: MigrationDirection
  readonly stepVerb: string
  readonly doneVerb: string
  applyMigration(migration: LoadedMigration, db: Db, client: MongoClient): Promise<unknown>
  updateState(db: Db, collectionName: string, migration: MigrationRef): Promise<void>
}

export async function runMigrationCommand(
  options: RunMigrationCommandOptions,
  logger: Logger,
  strategy: MigrationCommandStrategy
): Promise<void> {
  const { cwd, targetVersion, targetFile, phase } = options
  const config = await loadConfig(cwd)
  const mongoUri = await resolveMongoUri(config.mongoUri, cwd)
  const migrationsDir = isAbsolute(config.migrationsDir) ? config.migrationsDir : join(cwd, config.migrationsDir)

  const { client, db } = await connect(mongoUri)
  try {
    const [applied, discovered] = await Promise.all([
      getAppliedMigrations(db, config.stateCollection),
      discoverMigrations(migrationsDir)
    ])
    const plan = computeMigrationPlan({
      direction: strategy.direction,
      phase,
      targetVersion,
      targetFile,
      applied,
      discovered
    })

    if (plan.length === 0) {
      logger.info(`Nothing to do for phase "${phase}".`)
      return
    }

    for (const migrationRef of plan) {
      const migrationPath = `${migrationRef.version}/${migrationRef.phase}/${migrationRef.file}`
      const discoveredMigration = discovered.find(
        (m) => m.version === migrationRef.version && m.phase === migrationRef.phase && m.file === migrationRef.file
      )
      if (!discoveredMigration) {
        throw new Error(`Migration "${migrationPath}" was not found on disk.`)
      }
      logger.step(`${strategy.stepVerb} ${migrationPath}...`)
      // Migrations must apply in order, one at a time — these awaits cannot be parallelized.
      /* eslint-disable no-await-in-loop */
      const migration = await loadMigration(discoveredMigration.filePath)
      await strategy.applyMigration(migration, db, client)
      await strategy.updateState(db, config.stateCollection, migrationRef)
      /* eslint-enable no-await-in-loop */
    }
    logger.success(`${strategy.doneVerb} ${String(plan.length)} migration(s).`)
  } finally {
    await client.close()
  }
}
