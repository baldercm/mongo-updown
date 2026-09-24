import type { Dirent } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { isMigrationPhase, MIGRATION_PHASES } from '#Migrations/migration-plan'
import type { MigrationRef } from '#Migrations/migration-plan'
import { parseSemver } from '#Migrations/semver'

export interface DiscoveredMigration extends MigrationRef {
  readonly filePath: string
}

function isMigrationFile(entry: Dirent): boolean {
  return entry.isFile() && entry.name.endsWith('.js')
}

async function discoverVersionMigrations(migrationsDir: string, version: string): Promise<DiscoveredMigration[]> {
  const versionDir = join(migrationsDir, version)
  const entries = await readdir(versionDir, { withFileTypes: true })

  const unphasedFile = entries.find(isMigrationFile)
  if (unphasedFile) {
    throw new Error(
      `Migration "${unphasedFile.name}" in version ${version} must live in a "pre/" or "post/" subdirectory.`
    )
  }

  const phaseDirs = entries.filter((entry) => entry.isDirectory())
  const unknownPhaseDir = phaseDirs.find((entry) => !isMigrationPhase(entry.name))
  if (unknownPhaseDir) {
    throw new Error(
      `Unknown phase directory "${unknownPhaseDir.name}" in version ${version}: expected "pre" or "post".`
    )
  }

  const presentPhases = MIGRATION_PHASES.filter((phase) => phaseDirs.some((entry) => entry.name === phase))
  const migrationsByPhase = await Promise.all(
    presentPhases.map(async (phase) => {
      const phaseDir = join(versionDir, phase)
      const fileEntries = await readdir(phaseDir, { withFileTypes: true })
      return fileEntries.filter(isMigrationFile).map((fileEntry) => ({
        version,
        phase,
        file: fileEntry.name,
        filePath: join(phaseDir, fileEntry.name)
      }))
    })
  )

  return migrationsByPhase.flat()
}

export async function discoverMigrations(migrationsDir: string): Promise<DiscoveredMigration[]> {
  let versionEntries
  try {
    versionEntries = await readdir(migrationsDir, { withFileTypes: true })
  } catch (error) {
    throw new Error(`Could not read migrations directory "${migrationsDir}": ${String(error)}`)
  }

  const versionDirs = versionEntries.filter((entry) => entry.isDirectory())
  for (const versionDir of versionDirs) {
    parseSemver(versionDir.name)
  }

  const migrationsByVersion = await Promise.all(
    versionDirs.map((versionEntry) => discoverVersionMigrations(migrationsDir, versionEntry.name))
  )

  return migrationsByVersion.flat()
}
