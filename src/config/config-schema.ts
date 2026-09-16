export interface MongoUriFromEnv {
  readonly fromEnv: string
}

export interface MongoUriFromFile {
  readonly fromFile: string
}

export type MongoUriSource = MongoUriFromEnv | MongoUriFromFile

export interface MongoUpdownConfig {
  readonly mongoUri: MongoUriSource
  readonly migrationsDir: string
  readonly stateCollection: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isMongoUriSource(value: unknown): value is MongoUriSource {
  return isRecord(value) && (typeof value.fromEnv === 'string' || typeof value.fromFile === 'string')
}

export function isMongoUpdownConfig(value: unknown): value is MongoUpdownConfig {
  return (
    isRecord(value) &&
    isMongoUriSource(value.mongoUri) &&
    typeof value.migrationsDir === 'string' &&
    typeof value.stateCollection === 'string'
  )
}
