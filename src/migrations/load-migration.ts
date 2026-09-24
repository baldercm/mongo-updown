import { pathToFileURL } from 'node:url'

import type { ClientSession, Db, MongoClient } from 'mongodb'

export interface MigrationContext {
  readonly db: Db
  readonly client: MongoClient
  readonly session: ClientSession | undefined
}

type MigrationFunction = (context: MigrationContext) => Promise<unknown>

export interface LoadedMigration {
  readonly up: MigrationFunction
  readonly down: MigrationFunction
  readonly transaction: boolean
}

interface MigrationModule {
  readonly up: MigrationFunction
  readonly down: MigrationFunction
  readonly transaction?: unknown
}

function isMigrationModule(value: unknown): value is MigrationModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).up === 'function' &&
    typeof (value as Record<string, unknown>).down === 'function'
  )
}

export async function loadMigration(filePath: string): Promise<LoadedMigration> {
  const imported = (await import(pathToFileURL(filePath).href)) as Record<string, unknown>
  const candidate = isMigrationModule(imported.default) ? imported.default : imported
  if (!isMigrationModule(candidate)) {
    throw new Error(`Migration file "${filePath}" must export up(context) and down(context) functions.`)
  }
  const { transaction = false } = candidate
  if (typeof transaction !== 'boolean') {
    throw new Error(`Migration file "${filePath}" exports "transaction", which must be a boolean.`)
  }
  return {
    up: (context) => candidate.up(context),
    down: (context) => candidate.down(context),
    transaction
  }
}
