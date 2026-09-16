export type HostModuleType = 'commonjs' | 'module'

export const DEFAULT_MIGRATIONS_DIR = './migrations'
export const DEFAULT_STATE_COLLECTION = 'mongo_updown_migrations'

const CONFIG_BODY = `mongoUri: { fromEnv: 'MONGO_URI' },
  migrationsDir: '${DEFAULT_MIGRATIONS_DIR}',
  stateCollection: '${DEFAULT_STATE_COLLECTION}',
`

export function buildDefaultConfigContent(moduleType: HostModuleType): string {
  return moduleType === 'module' ? `export default {\n  ${CONFIG_BODY}}\n` : `module.exports = {\n  ${CONFIG_BODY}}\n`
}
