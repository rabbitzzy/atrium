import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { fromVercel } from './vercel-handler'

/** Drive a handler the way the catch-all does, and read the whole answer. */
async function call(handler: Parameters<typeof fromVercel>[0], url: string, init?: RequestInit) {
  const res = await fromVercel(handler)(new Request(url, init))
  return { res, text: await res.text() }
}

describe('what the handler is given', () => {
  test('method, path and a single query value', async () => {
    let seen: Record<string, unknown> = {}
    const { res } = await call((req: any, r: any) => {
      seen = { method: req.method, id: req.query['id'] }
      r.status(200).json({ ok: true })
    }, 'https://k.test/api/x?id=abc')

    assert.equal(res.status, 200)
    assert.deepEqual(seen, { method: 'GET', id: 'abc' })
  })

  test('a repeated query key stays an array', async () => {
    // Handlers narrow with `typeof x === 'string'`. Flattening a duplicate into
    // one value would make a tampered request look like a legitimate one.
    let id: unknown
    await call((req: any, r: any) => {
      id = req.query['id']
      r.status(200).json({})
    }, 'https://k.test/api/x?id=a&id=b')
    assert.deepEqual(id, ['a', 'b'])
  })

  test('a JSON body arrives parsed, as Vercel delivers it', async () => {
    let body: unknown
    await call(
      (req: any, r: any) => {
        body = req.body
        r.status(200).json({})
      },
      'https://k.test/api/x',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"studentId":"s1"}' },
    )
    assert.deepEqual(body, { studentId: 's1' })
  })

  test('a body that is not JSON is passed through, not thrown on', async () => {
    // The route validates and answers 400 itself; a parse error here would turn
    // that into a 500.
    let body: unknown
    await call(
      (req: any, r: any) => {
        body = req.body
        r.status(200).json({})
      },
      'https://k.test/api/x',
      { method: 'POST', body: 'not json' },
    )
    assert.equal(body, 'not json')
  })

  test('headers are lowercased, so the admin gate can find its token', async () => {
    let token: unknown
    await call(
      (req: any, r: any) => {
        token = req.headers['x-admin-token']
        r.status(200).json({})
      },
      'https://k.test/api/x',
      { headers: { 'X-Admin-Token': 'sekrit' } },
    )
    assert.equal(token, 'sekrit')
  })
})

describe('what the handler sends back', () => {
  test('status and JSON body', async () => {
    const { res, text } = await call((_req: any, r: any) => {
      r.status(201).json({ id: 7 })
    }, 'https://k.test/api/x')

    assert.equal(res.status, 201)
    assert.match(res.headers.get('content-type') ?? '', /application\/json/)
    assert.deepEqual(JSON.parse(text), { id: 7 })
  })

  test('405 keeps its Allow header', async () => {
    const { res } = await call((_req: any, r: any) => {
      r.setHeader('Allow', 'POST')
      r.status(405).json({ error: 'method_not_allowed' })
    }, 'https://k.test/api/x')

    assert.equal(res.status, 405)
    assert.equal(res.headers.get('allow'), 'POST')
  })

  test('204 with no body', async () => {
    const { res, text } = await call((_req: any, r: any) => {
      r.status(204).end()
    }, 'https://k.test/api/x')
    assert.equal(res.status, 204)
    assert.equal(text, '')
  })

  test('a PDF sent as bytes survives as bytes', async () => {
    // Read as bytes rather than through `call`, which consumes the body.
    const res = await fromVercel((_req: any, r: any) => {
      r.setHeader('content-type', 'application/pdf')
      r.status(200).send(Buffer.from('%PDF-1.7'))
    })(new Request('https://k.test/api/x'))

    assert.equal(res.headers.get('content-type'), 'application/pdf')
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), '%PDF-1.7')
  })
})

describe('streaming, which is why this is a real stream', () => {
  test('SSE frames arrive before the handler finishes', async () => {
    // The whole point of BHCS-10: bytes leave while the work is still running.
    // A buffering adapter would pass a content check and defeat the feature.
    let release!: () => void
    const done = new Promise<void>((r) => (release = r))

    const res = await fromVercel((_req: any, r: any) => {
      r.setHeader('content-type', 'text/event-stream; charset=utf-8')
      r.flushHeaders()
      r.write(': open\n\n')
      r.write('event: stored\ndata: {"id":1}\n\n')
      return done.then(() => {
        r.write('event: done\ndata: {"ok":true}\n\n')
        r.end()
      })
    })(new Request('https://k.test/api/capture'))

    assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8')

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let early = ''
    while (!early.includes('stored')) early += decoder.decode((await reader.read()).value)
    assert.match(early, /: open/)
    assert.match(early, /event: stored/)

    // Only now let the handler finish — proving the above was not buffered.
    release()
    let rest = ''
    for (;;) {
      const { value, done: end } = await reader.read()
      if (end) break
      rest += decoder.decode(value)
    }
    assert.match(rest, /event: done/)
  })

  test('a piped read stream reaches the client', async () => {
    // capture-file.ts does createReadStream(file).pipe(res).
    const { res, text } = await call((_req: any, r: any) => {
      r.setHeader('content-type', 'image/png')
      const source = new PassThrough()
      source.pipe(r)
      source.end('binary-ish')
    }, 'https://k.test/api/capture-file')

    assert.equal(res.headers.get('content-type'), 'image/png')
    assert.equal(text, 'binary-ish')
  })
})

describe('when a handler throws', () => {
  test('before committing, the error propagates so Hono can answer 500', async () => {
    await assert.rejects(
      () => call(() => { throw new Error('no credentials') }, 'https://k.test/api/x'),
      /no credentials/,
    )
  })

  test('after committing, the status already sent is kept', async () => {
    // Nothing can be un-sent at this point; the stream just stops.
    const res = await fromVercel((_req: any, r: any) => {
      r.status(200).setHeader('content-type', 'text/plain')
      r.write('partial')
      throw new Error('died mid-stream')
    })(new Request('https://k.test/api/x'))

    assert.equal(res.status, 200)
    await assert.rejects(() => res.text())
  })
})
