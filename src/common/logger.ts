import chalk from 'chalk'
import type { ChalkInstance } from 'chalk'

export interface Logger {
  info(message: string): void
  step(message: string): void
  success(message: string): void
  error(message: string): void
}

export function createConsoleLogger(color: ChalkInstance = chalk): Logger {
  return {
    info(message: string): void {
      process.stdout.write(`${color.dim(`· ${message}`)}\n`)
    },
    step(message: string): void {
      process.stdout.write(`${color.cyan(`▸ ${message}`)}\n`)
    },
    success(message: string): void {
      process.stdout.write(`${color.green(`✔ ${message}`)}\n`)
    },
    error(message: string): void {
      process.stderr.write(`${color.red(`✖ ${message}`)}\n`)
    }
  }
}

export const consoleLogger: Logger = createConsoleLogger()
