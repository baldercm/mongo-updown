import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Logger } from '#Common/logger'
import { buildDefaultConfigContent, DEFAULT_MIGRATIONS_DIR } from '#Config/default-config-template'
import { detectHostModuleType } from '#Config/host-module-type'
import { CONFIG_FILE_NAME } from '#Config/load-config'

export interface InitCommandOptions {
  readonly cwd: string
  readonly force: boolean
  readonly phases: boolean
}

export async function runInitCommand(options: InitCommandOptions, logger: Logger): Promise<void> {
  const { cwd, force, phases } = options
  const configPath = join(cwd, CONFIG_FILE_NAME)

  if (existsSync(configPath) && !force) {
    throw new Error(`"${CONFIG_FILE_NAME}" already exists. Pass --force to overwrite it.`)
  }

  const moduleType = await detectHostModuleType(cwd)
  await writeFile(configPath, buildDefaultConfigContent(moduleType, phases))
  await mkdir(join(cwd, DEFAULT_MIGRATIONS_DIR), { recursive: true })

  logger.success(`Wrote ${CONFIG_FILE_NAME} and created ${DEFAULT_MIGRATIONS_DIR}`)
}
