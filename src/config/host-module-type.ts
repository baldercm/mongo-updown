import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { HostModuleType } from '#Config/default-config-template'

export async function detectHostModuleType(cwd: string): Promise<HostModuleType> {
  try {
    const contents = await readFile(join(cwd, 'package.json'), 'utf8')
    const parsed = JSON.parse(contents) as { type?: unknown }
    return parsed.type === 'module' ? 'module' : 'commonjs'
  } catch {
    return 'commonjs'
  }
}
