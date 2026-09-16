import type { Db } from 'mongodb'

import type { MigrationRef } from '#Migrations/migration-plan'

export interface AppliedMigrationDocument extends MigrationRef {
  readonly appliedAt: Date
}

export async function getAppliedMigrations(db: Db, collectionName: string): Promise<MigrationRef[]> {
  const docs = await db.collection<AppliedMigrationDocument>(collectionName).find().toArray()
  return docs.map((doc) => ({ version: doc.version, file: doc.file }))
}

export async function recordAppliedMigration(db: Db, collectionName: string, migration: MigrationRef): Promise<void> {
  await db.collection<AppliedMigrationDocument>(collectionName).insertOne({
    version: migration.version,
    file: migration.file,
    appliedAt: new Date()
  })
}

export async function removeAppliedMigration(db: Db, collectionName: string, migration: MigrationRef): Promise<void> {
  await db
    .collection<AppliedMigrationDocument>(collectionName)
    .deleteMany({ version: migration.version, file: migration.file })
}
