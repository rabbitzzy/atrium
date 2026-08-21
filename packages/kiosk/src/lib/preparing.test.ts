import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prepareScript, linesShown, tailLine, PREPARING_BEAT_MS } from './preparing.js'

describe('what the station says while it makes a Card', () => {
  it('has enough to say to fill the wait', () => {
    // Generation is twenty to thirty seconds; a script that runs out in ten
    // leaves the child looking at a screen that has stopped.
    const script = prepareScript('math')
    assert.ok(script.length >= 10, `only ${script.length} lines`)
    const last = script[script.length - 1]
    assert.ok(last && last.at >= 25_000, `script ends at ${last?.at}ms`)
  })

  it('says both languages on every line', () => {
    for (const subject of ['math', 'lang/zh', 'lang/en', undefined]) {
      for (const line of prepareScript(subject)) {
        assert.ok(line.en.trim().length > 0, 'missing English')
        assert.ok(/[一-鿿]/.test(line.zh), `not Chinese: ${line.zh}`)
      }
    }
  })

  it('names the door they actually pressed', () => {
    assert.ok(prepareScript('math')[0]?.en.includes('Math'))
    assert.ok(prepareScript('lang/zh')[0]?.en.includes('Chinese'))
    assert.ok(prepareScript('lang/en')[0]?.en.includes('English'))
  })

  it('has something to say about a lucky pick too', () => {
    const first = prepareScript(undefined)[0]
    assert.ok(first && first.en.length > 0)
    assert.ok(!first.en.includes('undefined'))
  })

  it('survives a subject the Blueprint grew after this file was written', () => {
    const odd = prepareScript('art')
    assert.equal(odd.length, prepareScript(undefined).length)
    assert.ok(!odd.some((l) => l.en.includes('undefined') || l.zh.includes('undefined')))
  })

  // Telling a child to go and stand by the printer when nothing will come out
  // of it is the kind of small lie that makes them stop trusting the screen.
  it('does not promise paper in simulate mode', () => {
    const sim = prepareScript('math', true).map((l) => l.en).join(' ')
    assert.ok(!sim.includes('printer'), sim)
    assert.ok(sim.toLowerCase().includes('no paper'))

    const real = prepareScript('math', false).map((l) => l.en).join(' ')
    assert.ok(real.includes('printer'))
  })

  it('never tells them to press anything', () => {
    const all = prepareScript('math').flatMap((l) => [l.en, l.zh]).join(' ').toLowerCase()
    for (const word of ['tap ', 'click', 'error', 'failed', 'loading']) {
      assert.ok(!all.includes(word), `should not say "${word}"`)
    }
  })

  it('paces the lines slowly enough to read', () => {
    const script = prepareScript('math')
    for (let i = 1; i < script.length; i++) {
      assert.ok(script[i]!.at - script[i - 1]!.at >= 2000, 'lines arrive too fast to read')
    }
  })
})

describe('how much of the script is on screen', () => {
  const script = prepareScript('math')

  it('shows the first line straight away, so the press is acknowledged', () => {
    assert.equal(linesShown(script, 0).length, 1)
  })

  it('adds a line a beat at a time', () => {
    assert.equal(linesShown(script, PREPARING_BEAT_MS).length, 2)
    assert.equal(linesShown(script, PREPARING_BEAT_MS * 4).length, 5)
  })

  it('holds the full script rather than emptying when the wait runs long', () => {
    assert.equal(linesShown(script, 10 * 60_000).length, script.length)
  })
})

describe('when the wait outlasts the script', () => {
  const script = prepareScript('math')
  const end = script[script.length - 1]!.at

  it('says nothing extra while the script is still running', () => {
    assert.equal(tailLine(script, end), null)
    assert.equal(tailLine(script, 0), null)
  })

  // A screen whose newest line has not changed in a minute reads as frozen,
  // which is the thing this whole file exists to prevent.
  it('keeps talking, and does not repeat the same line twice in a row', () => {
    const first = tailLine(script, end + PREPARING_BEAT_MS)
    const second = tailLine(script, end + PREPARING_BEAT_MS * 2)
    assert.ok(first && second)
    assert.notEqual(first.en, second.en)
  })

  it('still says both languages after it starts repeating', () => {
    const line = tailLine(script, end + PREPARING_BEAT_MS * 7)
    assert.ok(line)
    assert.ok(/[一-鿿]/.test(line.zh))
  })

  it('never runs off the end of the pool', () => {
    for (let i = 1; i < 200; i++) {
      assert.ok(tailLine(script, end + PREPARING_BEAT_MS * i), `nothing to say at beat ${i}`)
    }
  })
})
