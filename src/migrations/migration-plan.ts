import { compareSemver, parseSemver } from '#Migrations/semver'

export type MigrationDirection = 'up' | 'down'

export type MigrationPhase = 'pre' | 'post'

export const MIGRATION_PHASES: readonly MigrationPhase[] = ['pre', 'post']

export function isMigrationPhase(value: string | undefined): value is MigrationPhase {
  return (MIGRATION_PHASES as readonly (string | undefined)[]).includes(value)
}

export interface MigrationRef {
  readonly version: string
  readonly phase: MigrationPhase
  readonly file: string
}

export interface ComputeMigrationPlanOptions {
  readonly direction: MigrationDirection
  readonly phase: MigrationPhase
  readonly targetVersion: string
  readonly targetFile?: string
  readonly applied: readonly MigrationRef[]
  readonly discovered: readonly MigrationRef[]
}

function isSameMigration(a: MigrationRef, b: MigrationRef): boolean {
  return a.version === b.version && a.phase === b.phase && a.file === b.file
}

function toMigrationRef(migration: MigrationRef): MigrationRef {
  return { version: migration.version, phase: migration.phase, file: migration.file }
}

function formatMigrationRef(migration: MigrationRef): string {
  return `${migration.version}/${migration.phase}/${migration.file}`
}

function sortAscending(migrations: MigrationRef[]): MigrationRef[] {
  return [...migrations].sort((a, b) => compareSemver(a.version, b.version) || a.file.localeCompare(b.file))
}

function sortDescending(migrations: MigrationRef[]): MigrationRef[] {
  return [...migrations].sort((a, b) => compareSemver(b.version, a.version) || b.file.localeCompare(a.file))
}

function findPendingUpTo(
  targetVersion: string,
  applied: readonly MigrationRef[],
  discovered: readonly MigrationRef[]
): MigrationRef[] {
  return discovered
    .filter(
      (migration) =>
        compareSemver(migration.version, targetVersion) <= 0 &&
        !applied.some((appliedMigration) => isSameMigration(appliedMigration, migration))
    )
    .map(toMigrationRef)
}

function findAppliedFrom(targetVersion: string, applied: readonly MigrationRef[]): MigrationRef[] {
  return applied.filter((migration) => compareSemver(migration.version, targetVersion) >= 0).map(toMigrationRef)
}

function assertPhaseOrder(options: ComputeMigrationPlanOptions): void {
  const { direction, phase, targetVersion, applied, discovered } = options

  if (direction === 'up' && phase === 'post') {
    const pendingPre = findPendingUpTo(
      targetVersion,
      applied,
      discovered.filter((migration) => migration.phase === 'pre')
    )
    if (pendingPre.length > 0) {
      throw new Error(
        `Cannot run post migrations up to ${targetVersion}: pending pre migrations must run first: ${sortAscending(pendingPre).map(formatMigrationRef).join(', ')}`
      )
    }
  }

  if (direction === 'down' && phase === 'pre') {
    const appliedPost = findAppliedFrom(
      targetVersion,
      applied.filter((migration) => migration.phase === 'post')
    )
    if (appliedPost.length > 0) {
      throw new Error(
        `Cannot roll back pre migrations from ${targetVersion}: applied post migrations must be rolled back first: ${sortDescending(appliedPost).map(formatMigrationRef).join(', ')}`
      )
    }
  }
}

export function computeMigrationPlan(options: ComputeMigrationPlanOptions): MigrationRef[] {
  const { direction, phase, targetVersion, targetFile } = options
  parseSemver(targetVersion)
  assertPhaseOrder(options)

  const applied = options.applied.filter((migration) => migration.phase === phase)
  const discovered = options.discovered.filter((migration) => migration.phase === phase)

  if (targetFile !== undefined) {
    const target: MigrationRef = { version: targetVersion, phase, file: targetFile }
    const isApplied = applied.some((migration) => isSameMigration(migration, target))
    if (direction === 'up') {
      const isDiscovered = discovered.some((migration) => isSameMigration(migration, target))
      return isDiscovered && !isApplied ? [target] : []
    }
    return isApplied ? [target] : []
  }

  if (direction === 'up') {
    return sortAscending(findPendingUpTo(targetVersion, applied, discovered))
  }

  return sortDescending(findAppliedFrom(targetVersion, applied))
}
