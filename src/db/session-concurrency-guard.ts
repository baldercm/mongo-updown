import { Binary } from 'mongodb'
import type {
  ClientSession,
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent,
  MongoClient
} from 'mongodb'

export interface SessionConcurrencyGuard {
  readonly overlapped: boolean
  dispose(): void
}

function sessionKey(id: unknown): string | undefined {
  return id instanceof Binary ? id.toString('hex') : undefined
}

// Needs a client created with `monitorCommands: true` (see `connect`); otherwise no command events are emitted.
export function watchSessionConcurrency(client: MongoClient, session: ClientSession): SessionConcurrencyGuard {
  const inFlight = new Set<number>()
  let overlapped = false

  const onStarted = (event: CommandStartedEvent): void => {
    // `session.id` is read per event: the server session is only assigned when the first command is sent.
    const watched = sessionKey(session.id?.id)
    if (watched === undefined || sessionKey((event.command.lsid as { id?: unknown } | undefined)?.id) !== watched) {
      return
    }
    if (inFlight.size > 0) {
      overlapped = true
    }
    inFlight.add(event.requestId)
  }
  const onFinished = (event: CommandSucceededEvent | CommandFailedEvent): void => {
    inFlight.delete(event.requestId)
  }

  client.on('commandStarted', onStarted)
  client.on('commandSucceeded', onFinished)
  client.on('commandFailed', onFinished)

  return {
    get overlapped() {
      return overlapped
    },
    dispose() {
      client.off('commandStarted', onStarted)
      client.off('commandSucceeded', onFinished)
      client.off('commandFailed', onFinished)
    }
  }
}
