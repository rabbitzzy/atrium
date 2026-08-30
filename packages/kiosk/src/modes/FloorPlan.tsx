/**
 * My Progress — the Floor plan, drawn (BHCS-33).
 *
 * `GET /students/:id/radar` has returned the data since BHCS-28 and nothing
 * drew it. Three audiences want three pictures out of one dataset; this is the
 * child's. Mei wants "a picture of all the things I know" — pride, one glance,
 * no numbers. The teacher's sortable cross-class view and the parent's portal
 * view are separate tickets reading the same endpoint.
 *
 * ── Thirteen axes, not thirty and not three ──
 *
 * Thirty Rooms is a dense polygon nobody reads. Three subjects is a triangle,
 * which cannot show that a child is flying in arithmetic and stuck on
 * fractions — the single most useful thing the picture could say. The axes are
 * the Blueprint's strands, coloured by subject, so it still reads as three
 * regions of one shape. The aggregation itself lives in `skill-graph`, so this
 * screen and the teacher's cannot drift into different numbers.
 *
 * ── The band is the honest part ──
 *
 * A Room with two attempts and one with twenty must not look equally solid.
 * After BHCS-32 that is not a hypothetical: a teacher's placement writes a
 * number for every Room in the Blueprint before the child has answered a single
 * question, so a plain filled polygon would show a complete, confident portrait
 * of a student nobody has tested.
 *
 * So the fill is what we are fairly sure of, the pale ring around it is what we
 * are not, and an axis nobody has worked yet is drawn hollow with a dashed
 * edge. A child does not need the word "confidence" to understand that solid
 * means done and outline means not visited.
 *
 * No numbers, no percentages, no peer comparison. Aimchess benchmarks against
 * similarly-rated players; doing that to a seven-year-old at a shared station
 * where classmates can see the screen is a different thing entirely.
 *
 * ── Two pictures, one fetch (BHCS-88) ──
 *
 * The radar cannot answer "what is in there, and what comes next", because a
 * strand axis has no inside. The map can, and it is the question a child asks
 * out loud. So this screen is a switch between two drawings of the same
 * response: the shape, and the building. Both obey the same rule about hollow
 * meaning untested, and neither shows a number.
 *
 * Never printed. The Floor plan is digital-first by policy — re-engagement is
 * not worth a Leaf.
 */

import { useEffect, useState } from 'react'
import type { Student } from '@atrium/schema'
import BlueprintMap from './BlueprintMap'
import type { MapEdge, MapRoom } from '../lib/blueprint-map'

interface Band {
  lo: number
  hi: number
}

interface Spoke {
  strandId: string
  labelEn: string
  labelZh: string
  subject: string
  value: number
  band: Band
  rooms: number
  seenRooms: number
  seen: boolean
}

/** Subject colours, matching the capture buttons the child already presses. */
const SUBJECT_COLOR: Record<string, string> = {
  math: '#1a6bb5',
  language: '#3f7a5e',
  art: '#b8557a',
  science: '#b87400',
}
const colorFor = (subject: string) => SUBJECT_COLOR[subject] ?? '#6b6a75'

/** Chinese first for the strand names, since the school is a Chinese school. */
const SIZE = 560
const CENTER = SIZE / 2
const RADIUS = 168

function pointAt(index: number, count: number, radius: number): [number, number] {
  // Start at twelve o'clock and go clockwise, which is how a child reads a
  // clock face and therefore how they will read this.
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2
  return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius]
}

const polygon = (values: number[]) =>
  values.map((v, i) => pointAt(i, values.length, RADIUS * Math.max(0, Math.min(1, v))).join(',')).join(' ')

type View = 'shape' | 'map'

export default function FloorPlan({ student, onBack }: { student: Student; onBack: () => void }) {
  const [spokes, setSpokes] = useState<Spoke[] | null>(null)
  const [rooms, setRooms] = useState<MapRoom[]>([])
  const [edges, setEdges] = useState<MapEdge[]>([])
  const [view, setView] = useState<View>('shape')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/floor-plan?studentId=${encodeURIComponent(student.id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { spokes?: Spoke[]; kcs?: MapRoom[]; edges?: MapEdge[] }) => {
        if (!live) return
        setSpokes(data.spokes ?? [])
        setRooms(data.kcs ?? [])
        setEdges(data.edges ?? [])
      })
      .catch(() => live && setError('cannot reach the numbers right now'))
    return () => {
      live = false
    }
  }, [student.id])

  const worked = spokes?.filter((s) => s.seen).length ?? 0

  return (
    <div style={sheet}>
      <button type="button" style={bigBack} onClick={onBack}>
        ← Back 返回
      </button>

      <h1 style={title}>
        What you know <span style={{ color: '#6b6a75' }}>你会的东西</span>
      </h1>

      {/* Two drawings of one response. The switch is words rather than icons
          because "shape" and "map" are the difference, and a pair of glyphs
          would make a child tap both to find out which was which. */}
      {spokes && spokes.length > 0 && rooms.length > 0 && (
        <div style={switcher} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'shape'}
            style={view === 'shape' ? tabOn : tabOff}
            onClick={() => setView('shape')}
          >
            ⬡ My shape 我的形状
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'map'}
            style={view === 'map' ? tabOn : tabOff}
            onClick={() => setView('map')}
          >
            🗺️ The whole map 整张地图
          </button>
        </div>
      )}

      {error && <p style={quiet}>{error}</p>}
      {!spokes && !error && <p style={quiet}>Loading… 加载中…</p>}

      {view === 'map' && rooms.length > 0 && <BlueprintMap rooms={rooms} edges={edges} />}

      {view === 'shape' && spokes && spokes.length > 0 && (
        <>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: '100%', maxWidth: 560 }} role="img"
               aria-label={`Progress across ${spokes.length} areas`}>
            {/* Rings. Four, unlabelled — they give the shape somewhere to sit
                without turning the picture into a graph with a scale. */}
            {[0.25, 0.5, 0.75, 1].map((r) => (
              <circle key={r} cx={CENTER} cy={CENTER} r={RADIUS * r} fill="none" stroke="#e4e1db" strokeWidth={1} />
            ))}

            {spokes.map((s, i) => {
              const [x, y] = pointAt(i, spokes.length, RADIUS)
              return <line key={s.strandId} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="#e4e1db" strokeWidth={1} />
            })}

            {/* What we are not sure of: the gap between the low and high edges
                of the band, drawn as a pale ring behind the fill. */}
            <polygon points={polygon(spokes.map((s) => s.band.hi))} fill="#1a6bb5" opacity={0.1} />
            <polygon points={polygon(spokes.map((s) => s.band.lo))} fill="#f8f7f4" />

            {/* What we are fairly sure of. */}
            <polygon
              points={polygon(spokes.map((s) => s.value))}
              fill="#1a6bb5"
              fillOpacity={0.28}
              stroke="#1a6bb5"
              strokeWidth={2.5}
              strokeLinejoin="round"
            />

            {spokes.map((s, i) => {
              const [x, y] = pointAt(i, spokes.length, RADIUS * s.value)
              return (
                <circle
                  key={s.strandId}
                  cx={x}
                  cy={y}
                  r={s.seen ? 6 : 5}
                  fill={s.seen ? colorFor(s.subject) : '#f8f7f4'}
                  stroke={colorFor(s.subject)}
                  strokeWidth={2}
                  strokeDasharray={s.seen ? undefined : '3 2'}
                />
              )
            })}

            {spokes.map((s, i) => {
              const [x, y] = pointAt(i, spokes.length, RADIUS + 34)
              const anchor = x < CENTER - 8 ? 'end' : x > CENTER + 8 ? 'start' : 'middle'
              return (
                <g key={s.strandId}>
                  <text x={x} y={y - 5} textAnchor={anchor} style={labelZh} fill={colorFor(s.subject)}>
                    {s.labelZh}
                  </text>
                  <text x={x} y={y + 10} textAnchor={anchor} style={labelEn} fill="#86838f">
                    {s.labelEn}
                  </text>
                </g>
              )
            })}
          </svg>

          <div style={legend}>
            <span style={legendItem}>
              <span style={{ ...dot, background: '#1a6bb5', borderColor: '#1a6bb5' }} /> you have worked here
              <span style={{ color: '#86838f' }}> 做过</span>
            </span>
            <span style={legendItem}>
              <span style={{ ...dot, background: '#fff', borderStyle: 'dashed' }} /> not visited yet
              <span style={{ color: '#86838f' }}> 还没去过</span>
            </span>
          </div>

          {/* The one sentence that keeps the picture honest for a parent
              standing behind the child during the cold-start weeks. */}
          <p style={quiet}>
            {worked === 0
              ? 'This is where your teacher thinks you are starting. Nothing here has been tested yet. 这是老师估计的起点，还没有测过。'
              : `You have worked in ${worked} of ${spokes.length} areas. The rest is still a guess. 你已经做过 ${worked} / ${spokes.length} 个方面，其余的还只是估计。`}
          </p>
        </>
      )}

      {spokes && spokes.length === 0 && !error && (
        <p style={quiet}>Nothing to show yet — put a page under the camera and it will fill in. 还没有内容。</p>
      )}
    </div>
  )
}

const sheet: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: '#f8f7f4',
  padding: 'clamp(12px, 4vw, 24px) clamp(12px, 4vw, 28px) 40px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 14,
  overflowY: 'auto',
  fontFamily: 'DM Sans, sans-serif',
  zIndex: 5,
}
const bigBack: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '14px 24px',
  fontSize: 17,
  fontWeight: 700,
  fontFamily: 'DM Sans, sans-serif',
  borderRadius: 14,
  border: '2px solid #d0cdc8',
  background: '#fff',
  color: '#1a1a2e',
  cursor: 'pointer',
}
const title: React.CSSProperties = { margin: 0, fontSize: 26, fontWeight: 700, color: '#1a1a2e', textAlign: 'center' }
const quiet: React.CSSProperties = { margin: 0, fontSize: 15, color: '#6b6a75', textAlign: 'center', maxWidth: 520, lineHeight: 1.6 }
const switcher: React.CSSProperties = { display: 'flex', gap: 8, padding: 5, borderRadius: 999, background: '#eeece7' }
const tabBase: React.CSSProperties = {
  padding: '9px 18px',
  borderRadius: 999,
  border: 'none',
  fontSize: 15,
  fontWeight: 700,
  fontFamily: 'DM Sans, sans-serif',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
const tabOn: React.CSSProperties = { ...tabBase, background: '#fff', color: '#1a1a2e', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
const tabOff: React.CSSProperties = { ...tabBase, background: 'transparent', color: '#6b6a75' }
const labelZh: React.CSSProperties = { fontSize: 14, fontWeight: 700 }
const labelEn: React.CSSProperties = { fontSize: 11 }
const legend: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '8px 22px', justifyContent: 'center', fontSize: 14, color: '#1a1a2e' }
const legendItem: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8 }
const dot: React.CSSProperties = { width: 12, height: 12, borderRadius: '50%', border: '2px solid #1a6bb5', display: 'inline-block' }
