import { compareSemver, parseSemver } from '#Migrations/semver'

export type MigrationDirection = 'up' | 'down'

export interface MigrationRef {
  readonly version: string
  readonly file: string
}

export interface ComputeMigrationPlanOptions {
  readonly direction: MigrationDirection
  readonly targetVersion: string
  readonly targetFile?: string
  readonly applied: readonly MigrationRef[]
  readonly discovered: readonly MigrationRef[]
}

function isSameMigration(a: MigrationRef, b: MigrationRef): boolean {
  return a.version === b.version && a.file === b.file
}

function sortAscending(migrations: MigrationRef[]): MigrationRef[] {
  return [...migrations].sort((a, b) => compareSemver(a.version, b.version) || a.file.localeCompare(b.file))
}

function sortDescending(migrations: MigrationRef[]): MigrationRef[] {
  return [...migrations].sort((a, b) => compareSemver(b.version, a.version) || b.file.localeCompare(a.file))
}

export function computeMigrationPlan(options: ComputeMigrationPlanOptions): MigrationRef[] {
  const { direction, targetVersion, targetFile, applied, discovered } = options
  parseSemver(targetVersion)

  if (targetFile !== undefined) {
    const target: MigrationRef = { version: targetVersion, file: targetFile }
    const isApplied = applied.some((migration) => isSameMigration(migration, target))
    if (direction === 'up') {
      const isDiscovered = discovered.some((migration) => isSameMigration(migration, target))
      return isDiscovered && !isApplied ? [target] : []
    }
    return isApplied ? [target] : []
  }

  if (direction === 'up') {
    const pending = discovered
      .filter(
        (migration) =>
          compareSemver(migration.version, targetVersion) <= 0 &&
          !applied.some((appliedMigration) => isSameMigration(appliedMigration, migration))
      )
      .map((migration) => ({ version: migration.version, file: migration.file }))
    return sortAscending(pending)
  }

  const toRollBack = applied.filter((migration) => compareSemver(migration.version, targetVersion) >= 0)
  return sortDescending(toRollBack)
}
