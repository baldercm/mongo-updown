export type HostModuleType = 'commonjs' | 'module'

export const DEFAULT_MIGRATIONS_DIR = './migrations'
export const DEFAULT_STATE_COLLECTION = 'mongo_updown_migrations'

function buildConfigBody(phases: boolean): string {
  return `phases: ${String(phases)},
  mongoUri: { fromEnv: 'MONGO_URI' },
  migrationsDir: '${DEFAULT_MIGRATIONS_DIR}',
  stateCollection: '${DEFAULT_STATE_COLLECTION}',
`
}

export function buildDefaultConfigContent(moduleType: HostModuleType, phases: boolean): string {
  const configBody = buildConfigBody(phases)
  return moduleType === 'module' ? `export default {\n  ${configBody}}\n` : `module.exports = {\n  ${configBody}}\n`
}
