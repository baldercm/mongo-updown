export interface Semver {
  readonly major: number
  readonly minor: number
  readonly patch: number
}

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/

export function parseSemver(version: string): Semver {
  const match = SEMVER_PATTERN.exec(version)
  if (!match) {
    throw new Error(`Invalid semver version: "${version}"`)
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a)
  const right = parseSemver(b)
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch
}
