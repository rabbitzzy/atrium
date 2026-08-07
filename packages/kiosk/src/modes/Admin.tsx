import { useCallback, useEffect, useMemo, useState } from 'react'
import type { OcrStatus, StorageBackend } from '@atrium/schema'
import { FOCUS_WARN_BELOW } from '../lib/focus'
import { APPS } from '../platform/registry'

/**
 * Dev-only data viewer, reachable at #admin.
 *
 * Exists to answer one question quickly: "what did OCR actually produce?"
 * Everything the row stores is shown verbatim — no summarizing, no formatting
 * of the OCR payload — because the point is to inspect the raw shape the
 * pipelines return, including the parts that look wrong.
 *
 * No auth, matching the current phase. This must not ship to a public
 * deployment as-is: it exposes every capture and every student name.
 */

interface Capture {
  id: string
  student_id: string
  student_name: string
  /** An app id. The viewer shows it verbatim and never branches on it. */
  kind: string
  storage_backend: StorageBackend
  storage_url: string
  crop_json: {
    paper?: string
    orientation?: string
    focus?: { chosen: number; candidates?: number[]; gate?: { locked: boolean; ms: number } }
    detect?: { method: 'detected' | 'fixed'; reason: string | null }
    mode?: { resizeMode: string; full?: boolean; maxWidth?: number; maxHeight?: number }
    output?: { width: number; height: number }
    source?: { width: number; height: number }
  } | null
  ocr_json: unknown
  ocr_status: OcrStatus
  ocr_error: string | null
  /** Null on rows captured before the handling app had a refine step. */
  refined_json: unknown
  refined_status: OcrStatus | null
  refined_error: string | null
  ocr_ms: number | null
  captured_at: string
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ok: { bg: '#d4f0e0', color: '#1a7a4a' },
  skipped: { bg: '#eee', color: '#666' },
  failed: { bg: '#ffe0d4', color: '#c04010' },
  pending: { bg: '#fff3d4', color: '#8a6a00' },
}

export default function Admin() {
  const [captures, setCaptures] = useState<Capture[] | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [kind, setKind] = useState<string>('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErrMsg(null)
    try {
      const qs = new URLSearchParams({ limit: '200' })
      if (kind) qs.set('kind', kind)
      const res = await fetch(`/api/captures?${qs}`)
      const body = (await res.json()) as { captures?: Capture[]; error?: string }
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
      setCaptures(body.captures ?? [])
    } catch (err) {
      setErrMsg((err as Error).message)
    }
  }, [kind])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const c of captures ?? []) acc[c.ocr_status] = (acc[c.ocr_status] ?? 0) + 1
    return acc
  }, [captures])

  return (
    <div style={page}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Captures</h1>
        <span style={{ fontSize: 13, color: '#888' }}>
          {captures ? `${captures.length} rows` : 'loading…'}
          {Object.entries(counts).map(([k, n]) => ` · ${n} ${k}`)}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={control}>
            <option value="">All kinds</option>
            {APPS.map((a) => (
              <option key={a.id} value={a.id}>{a.id}</option>
            ))}
          </select>
          <button onClick={() => void load()} style={control}>Refresh</button>
          <a href="#" style={{ ...control, textDecoration: 'none', color: '#1a6bb5' }}>← Kiosk</a>
        </div>
      </header>

      {errMsg && (
        <div style={{ padding: 14, background: '#fff0ee', border: '1px solid #ffc8c0', borderRadius: 10, color: '#c04010', fontSize: 14 }}>
          {errMsg}
        </div>
      )}

      {captures?.length === 0 && (
        <p style={{ color: '#999', fontSize: 14 }}>No captures yet. Take one from the kiosk.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {captures?.map((c) => {
          const open = expanded === c.id
          const status = STATUS_COLORS[c.ocr_status] ?? STATUS_COLORS['pending']!
          return (
            <div key={c.id} style={card}>
              <button onClick={() => setExpanded(open ? null : c.id)} style={rowBtn}>
                <span style={{ ...status, padding: '2px 10px', borderRadius: 14, fontSize: 12, fontWeight: 700 }}>
                  {c.ocr_status}
                </span>
                <span style={{ fontWeight: 600, minWidth: 90 }}>{c.kind}</span>
                <span style={{ minWidth: 130 }}>{c.student_name}</span>
                <span style={{ color: '#999', fontSize: 13, minWidth: 160 }}>
                  {new Date(c.captured_at).toLocaleString()}
                </span>
                <span style={{ color: '#999', fontSize: 13 }}>
                  {c.ocr_ms ? `${(c.ocr_ms / 1000).toFixed(1)}s` : '—'}
                </span>
                <span style={{ marginLeft: 'auto', color: '#bbb' }}>{open ? '▾' : '▸'}</span>
              </button>

              {open && (
                <div style={{ padding: '0 16px 16px', display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <a href={c.storage_url} target="_blank" rel="noreferrer">
                    <img src={c.storage_url} alt="" style={thumb} />
                  </a>
                  <div style={{ flex: 1, minWidth: 320 }}>
                    <dl style={meta}>
                      <dt>id</dt><dd>{c.id}</dd>
                      <dt>student_id</dt><dd>{c.student_id}</dd>
                      <dt>storage</dt><dd>{c.storage_backend}</dd>
                      {c.crop_json && (
                        <>
                          <dt>paper</dt>
                          <dd>{c.crop_json.paper} · {c.crop_json.orientation}</dd>
                          {c.crop_json.detect && (
                            <>
                              <dt>crop</dt>
                              <dd style={{ color: c.crop_json.detect.method === 'detected' ? '#1a7a4a' : '#8a6a00' }}>
                                {c.crop_json.detect.method === 'detected'
                                  ? 'page edges found, deskewed'
                                  : `fixed guide — ${c.crop_json.detect.reason ?? 'detection failed'}`}
                              </dd>
                            </>
                          )}
                          {c.crop_json.focus && (
                            <>
                              <dt>focus</dt>
                              <dd style={{ color: c.crop_json.focus.chosen < FOCUS_WARN_BELOW ? '#c04010' : '#1a7a4a' }}>
                                {c.crop_json.focus.chosen}
                                {c.crop_json.focus.candidates && ` (burst ${c.crop_json.focus.candidates.join('/')})`}
                              </dd>
                              {/* A capture that fired on a timeout rather than a
                                  settled lens is the one to distrust first. */}
                              {c.crop_json.focus.gate && (
                                <>
                                  <dt>autofocus</dt>
                                  <dd style={{ color: c.crop_json.focus.gate.locked ? '#1a7a4a' : '#c04010' }}>
                                    {c.crop_json.focus.gate.locked ? 'settled' : 'gave up'} after{' '}
                                    {(c.crop_json.focus.gate.ms / 1000).toFixed(1)}s
                                  </dd>
                                </>
                              )}
                            </>
                          )}
                          <dt>pixels</dt>
                          <dd>
                            {c.crop_json.source?.width}×{c.crop_json.source?.height} sensor →{' '}
                            {c.crop_json.output?.width}×{c.crop_json.output?.height} stored
                            {/* Only flag a shortfall we can actually prove: `full`
                                is absent on captures stored before it existed. */}
                            {c.crop_json.mode?.full === false && (
                              <span style={{ color: '#c04010' }}>
                                {' '}· below the camera's {c.crop_json.mode.maxWidth}×{c.crop_json.mode.maxHeight}
                              </span>
                            )}
                          </dd>
                        </>
                      )}
                      {c.ocr_error && <><dt>error</dt><dd style={{ color: '#c04010' }}>{c.ocr_error}</dd></>}
                      {c.refined_error && (
                        <><dt>refine error</dt><dd style={{ color: '#c04010' }}>{c.refined_error}</dd></>
                      )}
                    </dl>
                    {/*
                      Both payloads, never merged. The top one is what the model
                      read off the paper; the bottom is what the app made of it.
                      Seeing them together is the whole point of this viewer —
                      it is where you find out whether a "correction" was one.
                    */}
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 4, fontFamily: 'ui-monospace, monospace' }}>
                      ocr_json — what was read
                    </div>
                    <pre style={pre}>
                      {c.ocr_json ? JSON.stringify(c.ocr_json, null, 2) : '// no ocr_json (skipped or failed)'}
                    </pre>
                    {c.refined_status !== 'skipped' && (
                      <>
                        <div style={{ fontSize: 11, color: '#999', margin: '10px 0 4px', fontFamily: 'ui-monospace, monospace' }}>
                          refined_json — what it was taken to mean
                        </div>
                        <pre style={pre}>
                          {c.refined_json
                            ? JSON.stringify(c.refined_json, null, 2)
                            : '// no refined_json — captured before this app had a refine step'}
                        </pre>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const page: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: 24, maxWidth: 1100, margin: '0 auto', width: '100%' }
const card: React.CSSProperties = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.07)', overflow: 'hidden' }
const rowBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 14, textAlign: 'left' }
const control: React.CSSProperties = { padding: '7px 12px', fontSize: 13, fontFamily: 'DM Sans, sans-serif', borderRadius: 8, border: '1px solid #d0cdc8', background: '#fff', cursor: 'pointer' }
const thumb: React.CSSProperties = { width: 260, borderRadius: 8, border: '1px solid #e5e2dd', display: 'block' }
const meta: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '2px 12px', fontSize: 12, color: '#666', margin: '0 0 12px', fontFamily: 'ui-monospace, monospace' }
const pre: React.CSSProperties = { background: '#1a1a2e', color: '#e8e6e3', padding: 14, borderRadius: 8, fontSize: 12, lineHeight: 1.55, overflowX: 'auto', margin: 0, maxHeight: 420 }
