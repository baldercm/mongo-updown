import { pathToFileURL } from 'node:url'

import type { Db, MongoClient } from 'mongodb'

export interface LoadedMigration {
  up(db: Db, client: MongoClient): Promise<unknown>
  down(db: Db, client: MongoClient): Promise<unknown>
}

function isMigrationModule(value: unknown): value is LoadedMigration {
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
    throw new Error(`Migration file "${filePath}" must export up(db, client) and down(db, client) functions.`)
  }
  return candidate
}
