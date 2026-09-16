import { MongoClient } from 'mongodb'
import type { Db } from 'mongodb'

export interface MongoConnection {
  readonly client: MongoClient
  readonly db: Db
}

export async function connect(mongoUri: string): Promise<MongoConnection> {
  const client = new MongoClient(mongoUri)
  await client.connect()
  return { client, db: client.db() }
}
