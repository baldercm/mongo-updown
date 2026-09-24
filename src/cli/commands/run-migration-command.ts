import { isAbsolute, join } from 'node:path'

import type { ClientSession, Db, MongoClient } from 'mongodb'

import type { Logger } from '#Common/logger'
import { loadConfig, resolveMongoUri } from '#Config/load-config'
import { connect } from '#Db/connect'
import { getAppliedMigrations } from '#Db/migration-state-store'
import { watchSessionConcurrency } from '#Db/session-concurrency-guard'
import { deploymentSupportsTransactions } from '#Db/transaction-support'
import { discoverMigrations } from '#Migrations/discover-migrations'
import type { LoadedMigration, MigrationContext } from '#Migrations/load-migration'
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
  applyMigration(migration: LoadedMigration, context: MigrationContext): Promise<unknown>
  updateState(db: Db, collectionName: string, migration: MigrationRef, session?: ClientSession): Promise<void>
}

interface PlannedStep {
  readonly ref: MigrationRef
  readonly path: string
  readonly migration: LoadedMigration
}

async function runStep(
  step: PlannedStep,
  connection: { readonly db: Db; readonly client: MongoClient },
  stateCollection: string,
  strategy: MigrationCommandStrategy
): Promise<void> {
  const { db, client } = connection
  if (!step.migration.transaction) {
    await strategy.applyMigration(step.migration, { db, client, session: undefined })
    await strategy.updateState(db, stateCollection, step.ref)
    return
  }
  const parallelError = (cause?: unknown): Error =>
    new Error(
      `Migration "${step.path}" ran database operations in parallel inside its transaction, which MongoDB ` +
        'does not support. Await each operation before starting the next.',
      { cause }
    )
  // The migration's writes and its state event commit or abort together.
  await client.withSession((session) =>
    session.withTransaction(async () => {
      const guard = watchSessionConcurrency(client, session)
      try {
        await strategy.applyMigration(step.migration, { db, client, session })
      } catch (error) {
        // Replaces e.g. ConflictingOperationInProgress; the plain error also stops withTransaction from retrying.
        throw guard.overlapped ? parallelError(error) : error
      } finally {
        guard.dispose()
      }
      // Rejected even when the overlapping operations happened to succeed: throwing aborts the transaction.
      if (guard.overlapped) {
        throw parallelError()
      }
      await strategy.updateState(db, stateCollection, step.ref, session)
    })
  )
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

    // Load every planned migration before running any, so a broken file anywhere in the plan runs nothing.
    const steps: PlannedStep[] = []
    for (const migrationRef of plan) {
      const migrationPath = `${migrationRef.version}/${migrationRef.phase}/${migrationRef.file}`
      const discoveredMigration = discovered.find(
        (m) => m.version === migrationRef.version && m.phase === migrationRef.phase && m.file === migrationRef.file
      )
      if (!discoveredMigration) {
        throw new Error(`Migration "${migrationPath}" was not found on disk.`)
      }
      // Loaded in plan order so the first broken file reported is deterministic.
      // eslint-disable-next-line no-await-in-loop
      const migration = await loadMigration(discoveredMigration.filePath)
      steps.push({ ref: migrationRef, path: migrationPath, migration })
    }

    const transactional = steps.filter((step) => step.migration.transaction).map((step) => step.path)
    if (transactional.length > 0 && !(await deploymentSupportsTransactions(db))) {
      throw new Error(
        `Transactional migrations need a replica set or sharded cluster, but the server is standalone: ${transactional.join(', ')}`
      )
    }

    for (const step of steps) {
      logger.step(`${strategy.stepVerb} ${step.path}...`)
      // Migrations must apply in order, one at a time — these awaits cannot be parallelized.
      // eslint-disable-next-line no-await-in-loop
      await runStep(step, { db, client }, config.stateCollection, strategy)
    }
    logger.success(`${strategy.doneVerb} ${String(plan.length)} migration(s).`)
  } finally {
    await client.close()
  }
}
