/**
 * Run a bounded number of jobs at once, keeping every answer in its place.
 *
 * Pulled out of the close-up pass (BHCS-107) because it is the part of it that
 * can go quietly wrong: a worker pool sharing a cursor is two lines of code and
 * one of them decides whether reading nine boards returns nine positions or
 * eight positions and a duplicate. Here it can be tested.
 *
 * Never rejects. A job that throws lands as `null` in its own slot, because
 * the caller — a page of nine diagrams, one of which was unreadable — wants
 * the eight.
 */
export async function inParallel<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R | null>,
  onError?: (err: unknown, index: number) => void,
): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null)
  if (items.length === 0) return out

  let cursor = 0
  async function worker() {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      try {
        out[index] = await run(items[index]!, index)
      } catch (err) {
        onError?.(err, index)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
  )
  return out
}
