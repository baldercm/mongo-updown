import { MongoClient } from 'mongodb'
import type { Db } from 'mongodb'

export interface MongoConnection {
  readonly client: MongoClient
  readonly db: Db
}

// Credentials can't contain a raw "/" (the driver requires it percent-encoded), so the first "/" after the scheme
// starts the database path.
function hasDatabaseName(mongoUri: string): boolean {
  const [hostsAndPath = ''] = mongoUri.replace(/^mongodb(\+srv)?:\/\//, '').split('?')
  const pathStart = hostsAndPath.indexOf('/')
  return pathStart !== -1 && pathStart < hostsAndPath.length - 1
}

export async function connect(mongoUri: string): Promise<MongoConnection> {
  // Without a database path the driver silently falls back to "test", so migrations would run (and record state) there.
  if (!hasDatabaseName(mongoUri)) {
    throw new Error(
      'The MongoDB connection string must include a database name (e.g. "mongodb://localhost:27017/my-app").'
    )
  }
  const client = new MongoClient(mongoUri, { monitorCommands: true })
  await client.connect()
  return { client, db: client.db() }
}
