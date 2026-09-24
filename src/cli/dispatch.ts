import { parseArgs } from 'node:util'

import { isMigrationPhase } from '#Migrations/migration-plan'
import type { MigrationPhase } from '#Migrations/migration-plan'

export type CliCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'init'; readonly force: boolean; readonly phases: boolean }
  | {
      readonly kind: 'up'
      readonly targetVersion: string
      readonly targetFile?: string
      readonly phase?: MigrationPhase
    }
  | {
      readonly kind: 'down'
      readonly targetVersion: string
      readonly targetFile?: string
      readonly phase?: MigrationPhase
    }

export function parseCliArgs(argv: readonly string[]): CliCommand {
  const [command, ...rest] = argv

  if (command === undefined || command === '--help' || command === '-h') {
    return { kind: 'help' }
  }

  if (command === '--version' || command === '-v') {
    return { kind: 'version' }
  }

  if (command === 'init') {
    const { values } = parseArgs({
      args: rest,
      options: { force: { type: 'boolean', default: false }, phases: { type: 'string', default: 'true' } }
    })
    if (values.phases !== 'true' && values.phases !== 'false') {
      throw new Error(`Usage: mongo-updown init [--force] [--phases <true|false>]`)
    }
    return { kind: 'init', force: values.force, phases: values.phases === 'true' }
  }

  if (command === 'up' || command === 'down') {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { phase: { type: 'string' } },
      allowPositionals: true
    })
    const [targetVersion, targetFile] = positionals
    const { phase } = values
    if (!targetVersion || (phase !== undefined && !isMigrationPhase(phase))) {
      throw new Error(`Usage: mongo-updown ${command} <version> <file?> --phase <pre|post>`)
    }
    return { kind: command, targetVersion, targetFile, phase: isMigrationPhase(phase) ? phase : undefined }
  }

  throw new Error(`Unknown command "${command ?? ''}". Expected one of: init, up, down.`)
}
