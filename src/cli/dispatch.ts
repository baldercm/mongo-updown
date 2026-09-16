import { parseArgs } from 'node:util'

export type CliCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'init'; readonly force: boolean }
  | { readonly kind: 'up'; readonly targetVersion: string; readonly targetFile?: string }
  | { readonly kind: 'down'; readonly targetVersion: string; readonly targetFile?: string }

export function parseCliArgs(argv: readonly string[]): CliCommand {
  const [command, ...rest] = argv

  if (command === '--help' || command === '-h') {
    return { kind: 'help' }
  }

  if (command === '--version' || command === '-v') {
    return { kind: 'version' }
  }

  if (command === 'init') {
    const { values } = parseArgs({ args: rest, options: { force: { type: 'boolean', default: false } } })
    return { kind: 'init', force: values.force }
  }

  if (command === 'up' || command === 'down') {
    const { positionals } = parseArgs({ args: rest, options: {}, allowPositionals: true })
    const [targetVersion, targetFile] = positionals
    if (!targetVersion) {
      throw new Error(`Usage: mongo-updown ${command} <version> <file?>`)
    }
    return { kind: command, targetVersion, targetFile }
  }

  throw new Error(`Unknown command "${command ?? ''}". Expected one of: init, up, down.`)
}
