import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { parseSemver } from '#Migrations/semver'

export interface DiscoveredMigration {
  readonly version: string
  readonly file: string
  readonly filePath: string
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
    versionDirs.map(async (versionEntry) => {
      const versionDir = join(migrationsDir, versionEntry.name)
      const fileEntries = await readdir(versionDir, { withFileTypes: true })
      return fileEntries
        .filter((fileEntry) => fileEntry.isFile() && fileEntry.name.endsWith('.js'))
        .map((fileEntry) => ({
          version: versionEntry.name,
          file: fileEntry.name,
          filePath: join(versionDir, fileEntry.name)
        }))
    })
  )

  return migrationsByVersion.flat()
}
