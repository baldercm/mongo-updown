export async function runSequentially<T>(items: readonly T[], task: (item: T) => Promise<void>): Promise<void> {
  await items.reduce(async (previous, item) => {
    await previous
    await task(item)
  }, Promise.resolve())
}
