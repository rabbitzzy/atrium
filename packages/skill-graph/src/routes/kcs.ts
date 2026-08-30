/**
 * The Blueprint, served whole.
 *
 * `impl/skill-graph.md` describes this route as paginated, and the parameters
 * are here, but the default limit is 500 — comfortably the entire pilot
 * Blueprint (46 nodes) in one response. That is deliberate. Every caller so
 * far wants the graph, not a page of it: a radar chart needs all the axes, the
 * frontier query needs all the edges, and a teacher browsing Rooms needs to
 * see the shape. Pagination is here for the 200-500 KC graph the research
 * expects eventually, not to be used at 46.
 *
 * Edges are always returned complete for the same reason — a page of nodes
 * with a page of edges is a subgraph nobody asked for, and the whole edge set
 * is a few kilobytes.
 */

import { Hono } from 'hono'
import { getSupabase, rows } from '../db/client.js'

const router = new Hono()

const DEFAULT_LIMIT = 500
const MAX_LIMIT = 2000

// GET /kcs  — full Blueprint: nodes + edges
router.get('/', async (c) => {
  const db = getSupabase()

  const limit = Math.min(Number(c.req.query('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT)
  const offset = Number(c.req.query('offset') ?? 0) || 0
  const subject = c.req.query('subject')
  const depth = c.req.query('depth')

  let query = db
    .from('kcs')
    .select('id, label_en, label_zh, subject, depth, difficulty, bkt_p_l0, bkt_p_t, bkt_p_s, bkt_p_g', {
      count: 'exact',
    })
    .order('id')
    .range(offset, offset + limit - 1)

  if (subject) query = query.eq('subject', subject)
  // `?depth=2` is the assessable-leaf filter: headings are not Rooms and a
  // caller drawing a radar or picking a task never wants them.
  if (depth !== undefined && depth !== '') query = query.eq('depth', Number(depth))

  const { data: kcs, error, count } = await query
  if (error) return c.json({ error: error.message }, 500)

  const { data: edges, error: edgeError } = await db
    .from('kc_edges')
    .select('from_kc_id, to_kc_id, edge_type')
    .order('from_kc_id')
  if (edgeError) return c.json({ error: edgeError.message }, 500)

  return c.json({
    kcs: kcs ?? [],
    edges: edges ?? [],
    total: count ?? (kcs?.length ?? 0),
    limit,
    offset,
  })
})

// GET /kcs/:id  — one Room, with its immediate neighbours in both directions
router.get('/:id{.+}', async (c) => {
  const id = c.req.param('id')
  const db = getSupabase()

  const { data: kc, error } = await db
    .from('kcs')
    .select('id, label_en, label_zh, subject, depth, difficulty, bkt_p_l0, bkt_p_t, bkt_p_s, bkt_p_g')
    .eq('id', id)
    .single()
  if (error) return c.json({ error: error.message }, 404)

  const { data: edges, error: edgeError } = await db
    .from('kc_edges')
    .select('from_kc_id, to_kc_id, edge_type')
    .or(`from_kc_id.eq.${id},to_kc_id.eq.${id}`)
  if (edgeError) return c.json({ error: edgeError.message }, 500)

  type EdgeRow = { from_kc_id: string; to_kc_id: string; edge_type: string }
  const edgeRows = rows<EdgeRow>(edges)
  return c.json({
    ...kc,
    incoming: edgeRows.filter((e) => e.to_kc_id === id),
    outgoing: edgeRows.filter((e) => e.from_kc_id === id),
  })
})

export default router
