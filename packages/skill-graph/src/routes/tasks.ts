import { Hono } from 'hono'
import { getSupabase } from '../db/client.js'

const router = new Hono()

// GET /tasks/next/:studentId  — pick the next Card for a student's Landing (frontier KCs)
router.get('/next/:studentId', async (c) => {
  const studentId = c.req.param('studentId')
  const db = getSupabase()

  // Pull the student's current floor plan
  const { data: state, error } = await db
    .from('student_kc_state')
    .select('kc_id, mastery_prob')
    .eq('student_id', studentId)
    .order('mastery_prob', { ascending: false })
  if (error) return c.json({ error: error.message }, 500)

  // TODO: traverse Blueprint (kc_edges) to find frontier KCs
  // TODO: call worksheet generator to create a Card for the chosen KC(s)
  // Temporary: return the KC with lowest mastery that has been attempted at least once
  const target = state?.find((s) => s.mastery_prob !== null && s.mastery_prob < 0.8) ?? null
  return c.json({ studentId, targetKcId: target?.kc_id ?? null, note: 'stub — full BKT frontier logic pending' })
})

// GET /tasks/:id  — task detail with rubric
router.get('/:id', async (c) => {
  const taskId = c.req.param('id')
  const db = getSupabase()
  const { data, error } = await db.from('tasks').select('*').eq('id', taskId).single()
  if (error) return c.json({ error: error.message }, 404)
  return c.json(data)
})

export default router
