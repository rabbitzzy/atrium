/**
 * The Blueprint as a building (BHCS-88).
 *
 * The radar is a shape; this is a map. They answer different questions from
 * one fetch: "how am I doing across thirteen strands" and "what is actually in
 * here, where am I in it, and what does this Room open". The second question
 * is the one a child asks out loud at the station, and until now the only
 * honest answer was a teacher describing the graph from memory.
 *
 * ── Read at three distances ──
 *
 * From across the room it is a silhouette: how much of the building is filled
 * in. From a step away it is three wings and four floors, and whether the
 * filled Rooms are low or high. Up close, one tap on a Room says what it is,
 * how it is going, and what it comes after. Nothing requires reading the
 * English labels, which is deliberate — the Chinese label is under every Room
 * because it is four characters where the English is four words.
 *
 * ── Hollow means nobody has been in there ──
 *
 * The same promise the radar makes, and for the same reason: a teacher's
 * placement writes a mastery number for all thirty Rooms before the child has
 * answered one question. A solid building would be a portrait of a student
 * nobody has tested. Filled is measured, hollow is assumed, and the sentence at
 * the bottom says so in both languages.
 *
 * No numbers, no percentages, no comparison to anyone else — the whole screen
 * is under the same rule as the radar it sits beside.
 */

import { useState } from 'react'
import {
  layoutBlueprint,
  drawableEdges,
  roomLook,
  labelLines,
  waterLine,
  type MapRoom,
  type MapEdge,
  type PlacedRoom,
} from '../lib/blueprint-map'

const R = 17
const CROSSOVER = '#b8557a'

export default function BlueprintMap({
  rooms,
  edges,
}: {
  rooms: MapRoom[]
  edges: MapEdge[]
}) {
  const [picked, setPicked] = useState<string | null>(null)

  const layout = layoutBlueprint(rooms)
  const wires = drawableEdges(edges, layout.rooms)
  const chosen = layout.rooms.find((r) => r.kcId === picked) ?? null

  const colorOf = (room: PlacedRoom) =>
    layout.wings.find((w) => w.id === room.wing)?.color ?? '#6b6a75'

  // What the chosen Room comes after, and what it opens. Both are worth saying:
  // one explains why a Room has not been assigned yet, the other is the reason
  // to keep going.
  const comesAfter = chosen
    ? wires.filter((w) => w.to.kcId === chosen.kcId).map((w) => w.from)
    : []
  const opens = chosen ? wires.filter((w) => w.from.kcId === chosen.kcId).map((w) => w.to) : []

  const touched = (kcId: string) =>
    !picked || kcId === picked || comesAfter.some((r) => r.kcId === kcId) || opens.some((r) => r.kcId === kcId)

  const visited = layout.rooms.filter((r) => r.seen).length
  const mastered = layout.rooms.filter((r) => roomLook(r) === 'mastered').length

  return (
    <>
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{ width: '100%', minWidth: 640, display: 'block' }}
          role="img"
          aria-label={`A map of ${layout.rooms.length} rooms; ${visited} visited`}
          onClick={(e) => {
            // Tapping the background clears the selection. Without this the only
            // way out of a picked Room is to find another one, and a child who
            // taps to explore ends up unable to see the whole building again.
            if (e.target === e.currentTarget) setPicked(null)
          }}
        >
          {/* Floors, drawn as ground rather than gridlines: a faint band per
              storey, so height reads as a place you are standing rather than a
              value on an axis. */}
          {layout.floors.map((f, i) => (
            <g key={f.difficulty}>
              <rect
                x={0}
                y={f.y - 44}
                width={layout.width}
                height={88}
                fill={i % 2 === 0 ? '#f2f0ec' : 'transparent'}
                rx={10}
              />
              <text x={8} y={f.y + 4} style={floorNum} fill="#c3bfb8">
                {f.difficulty}
              </text>
            </g>
          ))}

          {layout.wings.map((w) => (
            <text key={w.id} x={(w.x0 + w.x1) / 2} y={26} textAnchor="middle" style={wingLabel} fill={w.color}>
              {w.labelZh} <tspan style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>{w.labelEn}</tspan>
            </text>
          ))}

          {/* Wiring under the Rooms, always. An edge crossing a Room is a line
              through a label, and the label is the part being read. */}
          {wires.map(({ edge, from, to }) => {
            const crossover = edge.type === 'crossover'
            const lit = touched(from.kcId) && touched(to.kcId)
            // A slight bow, bent away from the midpoint, so two edges between
            // the same pair of floors do not lie exactly on top of each other.
            const mx = (from.x + to.x) / 2 + (to.x - from.x) * 0.08
            const my = (from.y + to.y) / 2
            return (
              <path
                key={`${edge.from}→${edge.to}`}
                d={`M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`}
                fill="none"
                stroke={crossover ? CROSSOVER : '#c9c5bd'}
                strokeWidth={crossover ? 2 : 1.6}
                strokeDasharray={crossover ? '6 5' : undefined}
                opacity={lit ? (picked ? 0.95 : 0.65) : 0.12}
              />
            )
          })}

          {layout.rooms.map((room) => {
            const look = roomLook(room)
            const color = colorOf(room)
            const [top, bottom] = labelLines(room.labelZh)
            const lit = touched(room.kcId)
            return (
              <g
                key={room.kcId}
                onClick={() => setPicked(picked === room.kcId ? null : room.kcId)}
                style={{ cursor: 'pointer' }}
                opacity={lit ? 1 : 0.22}
              >
                {/* The tap target is bigger than the Room. Fingers are wider
                    than 17px and this screen is used by six-year-olds. */}
                <circle cx={room.x} cy={room.y} r={30} fill="transparent" />
                <circle
                  cx={room.x}
                  cy={room.y}
                  r={R}
                  fill={look === 'mastered' ? color : look === 'working' ? '#fff' : '#faf9f7'}
                  fillOpacity={look === 'working' ? 1 : 1}
                  stroke={look === 'unvisited' ? '#c3bfb8' : color}
                  strokeWidth={picked === room.kcId ? 4 : look === 'unvisited' ? 1.6 : 2.5}
                  strokeDasharray={look === 'unvisited' ? '4 3' : undefined}
                />
                {/* A working Room is part-filled from the bottom, which is the
                    one place a number appears on this screen and it appears as
                    a water line rather than a percentage. */}
                {look === 'working' && (
                  <path
                    d={waterLine(room.x, room.y, R, room.masteryProb)}
                    fill={color}
                    fillOpacity={0.55}
                  />
                )}
                <text x={room.x} y={room.y + R + 15} textAnchor="middle" style={roomLabel} fill="#4a4854">
                  {top}
                  {bottom && (
                    <tspan x={room.x} dy={12}>
                      {bottom}
                    </tspan>
                  )}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* The caption is a fixed block, not a tooltip. It never moves and never
          covers a Room, and it holds its height when nothing is picked so the
          page does not jump under a child's finger. */}
      <div style={caption}>
        {chosen ? (
          <>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#1a1a2e' }}>
              {chosen.labelZh} <span style={{ color: '#6b6a75', fontWeight: 600 }}>{chosen.labelEn}</span>
            </div>
            <div style={{ fontSize: 15, color: colorOf(chosen), fontWeight: 700 }}>
              {roomLook(chosen) === 'mastered'
                ? 'You have got this one 这个你会了'
                : roomLook(chosen) === 'working'
                  ? 'You are working on this 正在练'
                  : 'You have not been here yet 还没来过'}
            </div>
            {comesAfter.length > 0 && (
              <div style={{ fontSize: 14, color: '#6b6a75' }}>
                Comes after 先学: {comesAfter.map((r) => r.labelZh).join('、')}
              </div>
            )}
            {opens.length > 0 && (
              <div style={{ fontSize: 14, color: '#6b6a75' }}>
                Opens up 接下来: {opens.map((r) => r.labelZh).join('、')}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 15, color: '#6b6a75' }}>
            Tap any room to see what it is. 点一个房间看看是什么。
          </div>
        )}
      </div>

      <div style={legend}>
        <span style={legendItem}>
          <span style={{ ...swatch, background: '#1a6bb5', borderColor: '#1a6bb5' }} /> you have got it
          <span style={{ color: '#86838f' }}> 会了</span>
        </span>
        <span style={legendItem}>
          <span style={{ ...swatch, background: 'linear-gradient(to top, #1a6bb5 45%, #fff 45%)', borderColor: '#1a6bb5' }} />{' '}
          working on it<span style={{ color: '#86838f' }}> 在练</span>
        </span>
        <span style={legendItem}>
          <span style={{ ...swatch, background: '#fff', borderStyle: 'dashed' }} /> not been here yet
          <span style={{ color: '#86838f' }}> 还没去</span>
        </span>
        <span style={legendItem}>
          <span style={{ ...wire, background: CROSSOVER }} /> needs both subjects
          <span style={{ color: '#86838f' }}> 两科都用</span>
        </span>
      </div>

      <p style={quiet}>
        {visited === 0
          ? 'Nothing here has been tested yet — this is where your teacher thinks you are starting. 还没有测过，这是老师估计的起点。'
          : `You have worked in ${visited} of ${layout.rooms.length} rooms, and ${mastered} of them are yours. The hollow ones are still a guess. 你去过 ${visited} / ${layout.rooms.length} 个房间，其中 ${mastered} 个已经会了。空心的还只是估计。`}
      </p>
    </>
  )
}

const wingLabel: React.CSSProperties = { fontSize: 17, fontWeight: 700, fontFamily: 'DM Sans, sans-serif' }
const roomLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }
const floorNum: React.CSSProperties = { fontSize: 15, fontWeight: 700, fontFamily: 'DM Sans, sans-serif' }
const caption: React.CSSProperties = {
  minHeight: 92,
  width: '100%',
  maxWidth: 620,
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  padding: '14px 18px',
  borderRadius: 14,
  background: '#fff',
  border: '1px solid #e4e1db',
  textAlign: 'left',
  fontFamily: 'DM Sans, sans-serif',
}
const legend: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '8px 20px', justifyContent: 'center', fontSize: 14, color: '#1a1a2e' }
const legendItem: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7 }
const swatch: React.CSSProperties = { width: 13, height: 13, borderRadius: '50%', border: '2px solid #c3bfb8', display: 'inline-block' }
const wire: React.CSSProperties = { width: 18, height: 3, borderRadius: 2, display: 'inline-block' }
const quiet: React.CSSProperties = { margin: 0, fontSize: 15, color: '#6b6a75', textAlign: 'center', maxWidth: 620, lineHeight: 1.6 }
