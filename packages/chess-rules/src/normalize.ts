/**
 * Character-level repair of handwritten move text. No chess logic lives here —
 * this stage does not know what is on the board, only what a child's pencil
 * tends to do to SAN.
 *
 * Ported from chess-karma's `parser.py`, behavior-for-behavior. Two notes on
 * what that means:
 *
 *   - The original defines `_RANK_SUBS` and `_FILE_SUBS` look-alike tables
 *     (l/I→1, S→5, Z→2, 0→d) and never applies them. They are dead code there,
 *     so they are absent here: porting them would silently change which moves
 *     get corrected.
 *   - The candidate list is *ordered*, best guess first, and the validator
 *     reports the first candidate as `ok` and any later one as `normalized`.
 *     Order is therefore part of the contract, not an implementation detail.
 */

const PIECE_LETTERS = new Set('KQRBNkqrbn')
const FILES = new Set('abcdefgh')
const RANKS = new Set('12345678')

const CASTLE_LONG = /^[0Oo][—-][0Oo][—-][0Oo][+#]?$/
const CASTLE_SHORT = /^[0Oo][—-][0Oo][+#]?$/

const CASTLING_FORMS = new Set(['O-O-O', 'O-O', 'O-O-O+', 'O-O+', 'O-O-O#', 'O-O#'])

/**
 * Deterministic character fixes on one raw cell. Returns null for an empty or
 * absent cell — that is the "nothing was written here" signal, not a failure.
 */
export function normalizeRaw(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = raw.trim()
  if (!s) return null

  // Castling first, before spaces are stripped: the dashes and the zero/letter-O
  // confusion are the whole problem, and 0-0 is not a square.
  if (CASTLE_LONG.test(s)) return 'O-O-O' + checkSuffix(s)
  if (CASTLE_SHORT.test(s)) return 'O-O' + checkSuffix(s)

  // Kids space letters out.
  s = s.replace(/ /g, '')

  // An uppercase file letter at the start is a pawn move written loudly:
  // 'A3' means a3. 'B' is excluded because it is also the bishop.
  if (s.length >= 2 && 'ABCDEFGH'.includes(s[0]!) && !PIECE_LETTERS.has(s[0]!)) {
    s = s[0]!.toLowerCase() + s.slice(1)
  }

  return s
}

function checkSuffix(s: string): string {
  const last = s[s.length - 1]
  return last === '+' || last === '#' ? last : ''
}

/** Split SAN into body and its check/mate mark. */
function stripCheck(s: string): [string, string] {
  if (s.endsWith('#')) return [s.slice(0, -1), '#']
  if (s.endsWith('+')) return [s.slice(0, -1), '+']
  return [s, '']
}

/**
 * Expand each candidate with every check-mark variant.
 *
 * A child who omits the `+` on a checking move, or adds one to a quiet move,
 * has still told us which move they played, so neither should cost a match.
 */
function addCheckVariants(candidates: string[], suffix: string): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    const [body] = stripCheck(c)
    for (const suf of [suffix, '', '+', '#']) {
      const v = body + suf
      if (!seen.has(v)) {
        seen.add(v)
        result.push(v)
      }
    }
  }
  return result
}

/**
 * Ordered SAN candidates for one raw cell, most likely first.
 *
 * An empty list means the cell is unreadable — not that the move was illegal.
 */
export function generateCandidates(raw: string | null | undefined): string[] {
  const s = normalizeRaw(raw)
  if (!s) return []

  if (CASTLING_FORMS.has(s)) {
    const [body, suffix] = stripCheck(s)
    return addCheckVariants([body], suffix)
  }

  const [body, suffix] = stripCheck(s)
  // A cell of nothing but a check mark carries no move. The Python raises here;
  // returning empty says the same thing without taking the pipeline down.
  if (!body) return []

  const candidates: string[] = [body]
  const first = body[0]!

  // Lowercase piece letter: 'nf3' → 'Nf3'.
  if ('nbrqk'.includes(first.toLowerCase()) && first === first.toLowerCase() && body.length > 1) {
    const upper = first.toUpperCase() + body.slice(1)
    if (!candidates.includes(upper)) candidates.push(upper)
  }

  // 'Bc4' might be the b-pawn shouting rather than the bishop — but 'Bxc4'
  // almost certainly is the bishop, so an explicit capture rules this out.
  if (first === 'B' && body.length >= 2 && !body.includes('x')) {
    candidates.push('b' + body.slice(1))
  }

  // And the mirror: 'bg4' is far more often the bishop than the b-pawn.
  if (first === 'b' && body.length >= 3 && FILES.has(body[1]!) && RANKS.has(body[2]!)) {
    const bishop = 'B' + body.slice(1)
    if (!candidates.includes(bishop)) candidates.push(bishop)
  }

  // Captures: the x is the single most-omitted character on a scoresheet, and
  // occasionally an invented one. Each loop reads a snapshot, so candidates
  // added here are not themselves re-expanded — that is the original's shape
  // and it bounds the list.
  for (const base of [...candidates]) {
    const [b2] = stripCheck(base)
    if (!b2.includes('x') && b2.length >= 3) {
      const withX = b2.slice(0, -2) + 'x' + b2.slice(-2)
      if (!candidates.includes(withX)) candidates.push(withX)
    }
    if (b2.includes('x')) {
      const withoutX = b2.replace(/x/g, '')
      if (!candidates.includes(withoutX)) candidates.push(withoutX)
    }
  }

  // Stray marks: 'NVH6' → 'Nh6'. Keeps only characters that can appear in SAN.
  for (const base of [...candidates]) {
    const [b2] = stripCheck(base)
    const cleaned = b2.replace(/[^KQRBNkqrbnabcdefgh12345678x]/g, '')
    if (cleaned && !candidates.includes(cleaned) && cleaned !== b2) candidates.push(cleaned)
  }

  // A bare destination with no piece letter: 'd4' could be a pawn or anything
  // that reaches d4. The validator decides; this just offers the shapes.
  for (const base of [...candidates]) {
    const [b2] = stripCheck(base)
    if (b2.length === 2 && FILES.has(b2[0]!) && RANKS.has(b2[1]!)) {
      for (const piece of 'NBRQ') {
        const withPiece = piece + b2
        if (!candidates.includes(withPiece)) candidates.push(withPiece)
      }
    }
  }

  return addCheckVariants(candidates, suffix)
}
