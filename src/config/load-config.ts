import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { isMongoUpdownConfig } from '#Config/config-schema'
import type { MongoUpdownConfig, MongoUriSource } from '#Config/config-schema'

export const CONFIG_FILE_NAME = 'mongo-updown.config.js'

export async function loadConfig(cwd: string): Promise<MongoUpdownConfig> {
  const configPath = join(cwd, CONFIG_FILE_NAME)
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found at "${configPath}". Run "mongo-updown init" first.`)
  }

  const imported = (await import(pathToFileURL(configPath).href)) as { default?: unknown }
  if (!isMongoUpdownConfig(imported.default)) {
    throw new Error(`Invalid ${CONFIG_FILE_NAME}: does not match the expected MongoUpdownConfig shape.`)
  }
  return imported.default
}

export async function resolveMongoUri(source: MongoUriSource, cwd: string): Promise<string> {
  if ('fromEnv' in source) {
    const value = process.env[source.fromEnv]
    if (!value) {
      throw new Error(`Environment variable "${source.fromEnv}" is not set.`)
    }
    return value
  }

  const filePath = isAbsolute(source.fromFile) ? source.fromFile : join(cwd, source.fromFile)
  const contents = await readFile(filePath, 'utf8')
  return contents.trim()
}
