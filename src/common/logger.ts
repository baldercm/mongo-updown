export interface Logger {
  info(message: string): void
  error(message: string): void
}

export const consoleLogger: Logger = {
  info(message: string): void {
    process.stdout.write(`${message}\n`)
  },
  error(message: string): void {
    process.stderr.write(`${message}\n`)
  }
}
