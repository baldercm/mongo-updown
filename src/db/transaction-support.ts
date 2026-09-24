import type { Db, Document } from 'mongodb'

// Transactions need a replica set member (`setName`) or a mongos router (`msg: 'isdbgrid'`); standalone has neither.
export function supportsTransactions(hello: Document): boolean {
  return typeof hello.setName === 'string' || hello.msg === 'isdbgrid'
}

export async function deploymentSupportsTransactions(db: Db): Promise<boolean> {
  return supportsTransactions(await db.admin().command({ hello: 1 }))
}
