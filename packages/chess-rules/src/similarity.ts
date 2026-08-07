/**
 * A port of Python's `difflib.SequenceMatcher(None, a, b).ratio()`.
 *
 * This exists because the validator's last-resort pass ranks *every legal move*
 * by similarity to what the child wrote, and picks the winner. Which move that
 * is depends on the exact scoring function — swapping in Levenshtein or a
 * bigram score would resolve some garbled moves differently, silently, with no
 * failing test to notice. chess-karma's corrections are known-good against a
 * real scoresheet, so the algorithm is reproduced rather than approximated.
 *
 * The algorithm is Ratcliff-Obershelp: find the longest matching block, then
 * recurse into what is left on either side of it. `ratio` is 2·M/T, where M is
 * the total matched length and T the combined length.
 *
 * Python's `autojunk` heuristic (treating elements that appear in over 1% of
 * `b` as noise) only engages at length 200 and above. SAN strings are single
 * digits long, so it never applies and is not implemented.
 */

interface Block {
  ai: number
  bj: number
  size: number
}

/**
 * The longest matching block in a[alo:ahi] against b[blo:bhi].
 *
 * Ties are broken exactly as Python does — earliest in `a`, then earliest in
 * `b` — which matters, because a tie here changes which move gets chosen.
 */
function findLongestMatch(
  a: string,
  b: string,
  alo: number,
  ahi: number,
  blo: number,
  bhi: number,
  b2j: Map<string, number[]>,
): Block {
  let besti = alo
  let bestj = blo
  let bestsize = 0

  // j2len[j] is the length of the longest match ending at a[i-1] and b[j-1];
  // rebuilt per i, which is what keeps this O(n·m) rather than O(n·m·k).
  let j2len = new Map<number, number>()

  for (let i = alo; i < ahi; i++) {
    const newj2len = new Map<number, number>()
    for (const j of b2j.get(a[i]!) ?? []) {
      if (j < blo) continue
      if (j >= bhi) break
      const k = (j2len.get(j - 1) ?? 0) + 1
      newj2len.set(j, k)
      // Strictly greater, so the first-found longest match wins the tie.
      if (k > bestsize) {
        besti = i - k + 1
        bestj = j - k + 1
        bestsize = k
      }
    }
    j2len = newj2len
  }

  return { ai: besti, bj: bestj, size: bestsize }
}

/** Total length matched between a and b, by recursive longest-block descent. */
function matchingSize(a: string, b: string, b2j: Map<string, number[]>): number {
  let total = 0
  // Explicit stack rather than recursion: same traversal, no depth limit.
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]]

  while (queue.length > 0) {
    const [alo, ahi, blo, bhi] = queue.pop()!
    const { ai, bj, size } = findLongestMatch(a, b, alo, ahi, blo, bhi, b2j)
    if (size === 0) continue
    total += size
    if (alo < ai && blo < bj) queue.push([alo, ai, blo, bj])
    if (ai + size < ahi && bj + size < bhi) queue.push([ai + size, ahi, bj + size, bhi])
  }

  return total
}

/** Ratio of matching characters, 0–1. Equivalent to difflib's `ratio()`. */
export function sequenceRatio(a: string, b: string): number {
  const total = a.length + b.length
  if (total === 0) return 1

  const b2j = new Map<string, number[]>()
  for (let j = 0; j < b.length; j++) {
    const ch = b[j]!
    const list = b2j.get(ch)
    if (list) list.push(j)
    else b2j.set(ch, [j])
  }

  return (2 * matchingSize(a, b, b2j)) / total
}

/**
 * Chess-aware similarity between raw OCR text and a candidate SAN string.
 *
 * Case, the capture `x`, and check/mate marks are stripped first: those are the
 * most common divergences between a child's handwriting and valid SAN, and
 * scoring them as differences would rank a correct move below a wrong one.
 */
export function sanSimilarity(raw: string, san: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/x/g, '').replace(/[+#]+$/, '')
  return sequenceRatio(normalize(raw), normalize(san))
}
