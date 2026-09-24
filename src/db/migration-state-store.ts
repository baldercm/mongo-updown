import type { ClientSession, Db } from 'mongodb'

import type { MigrationDirection, MigrationRef } from '#Migrations/migration-plan'

export interface MigrationEventDocument extends MigrationRef {
  readonly direction: MigrationDirection
  readonly date: Date
}

async function recordMigrationEvent(
  db: Db,
  collectionName: string,
  migration: MigrationRef,
  direction: MigrationDirection,
  session: ClientSession | undefined
): Promise<void> {
  await db.collection<MigrationEventDocument>(collectionName).insertOne(
    {
      version: migration.version,
      phase: migration.phase,
      file: migration.file,
      direction,
      date: new Date()
    },
    { session }
  )
}

export async function recordMigrationUp(
  db: Db,
  collectionName: string,
  migration: MigrationRef,
  session?: ClientSession
): Promise<void> {
  await recordMigrationEvent(db, collectionName, migration, 'up', session)
}

export async function recordMigrationDown(
  db: Db,
  collectionName: string,
  migration: MigrationRef,
  session?: ClientSession
): Promise<void> {
  await recordMigrationEvent(db, collectionName, migration, 'down', session)
}

export async function getAppliedMigrations(db: Db, collectionName: string): Promise<MigrationRef[]> {
  return db
    .collection<MigrationEventDocument>(collectionName)
    .aggregate<MigrationRef>([
      { $sort: { date: 1, _id: 1 } },
      { $group: { _id: { version: '$version', phase: '$phase', file: '$file' }, direction: { $last: '$direction' } } },
      { $match: { direction: 'up' } },
      { $replaceWith: '$_id' }
    ])
    .toArray()
}
