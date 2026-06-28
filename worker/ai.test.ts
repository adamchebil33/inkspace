import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { summarizeNotes } from './ai'
import { collectNotes } from './notes'

const SUMMARY = {
  summary: 'The team is planning a launch.',
  themes: [{ title: 'Launch', notes: ['Ship on Friday'] }],
  actionItems: ['Book the demo room'],
}

/** A fake `fetch` that answers like the Gemini API. */
function fakeGemini(body: unknown, status = 200) {
  return vi.fn(async () => Response.json(body, { status })) as unknown as typeof fetch &
    ReturnType<typeof vi.fn>
}

const reply = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] })

describe('summarizeNotes', () => {
  it('says so when there is no API key, without calling anything', async () => {
    const fetch = fakeGemini({})
    const result = await summarizeNotes(['a'], { apiKey: undefined, fetch })
    expect(result).toEqual({ ok: false, error: 'not_configured' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the notes and returns the parsed summary', async () => {
    const fetch = fakeGemini(reply(JSON.stringify(SUMMARY)))
    const result = await summarizeNotes(['Ship on Friday', 'Book a room'], {
      apiKey: 'secret',
      model: 'test-model',
      fetch,
    })
    expect(result).toEqual({ ok: true, summary: SUMMARY })

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/models/test-model:generateContent')
    // The key travels in a header, never in the URL.
    expect(url).not.toContain('secret')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret')
    const body = JSON.parse(init.body as string)
    expect(body.contents[0].parts[0].text).toBe('1. Ship on Friday\n2. Book a room')
    expect(body.generationConfig.responseMimeType).toBe('application/json')
  })

  it('reports the AI quota being exhausted as rate limiting', async () => {
    const result = await summarizeNotes(['a'], { apiKey: 'k', fetch: fakeGemini({}, 429) })
    expect(result).toEqual({ ok: false, error: 'rate_limited' })
  })

  it.each([
    ['a server error', fakeGemini({ error: 'boom' }, 500)],
    ['text that is not JSON', fakeGemini(reply('Sure! Here is your summary'))],
    ['JSON in the wrong shape', fakeGemini(reply('{"themes": []}'))],
    ['an empty reply', fakeGemini({ candidates: [] })],
    [
      'a network failure',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
    ],
  ])('fails cleanly on %s', async (_name, fetch) => {
    expect(await summarizeNotes(['a'], { apiKey: 'k', fetch })).toEqual({
      ok: false,
      error: 'failed',
    })
  })

  it('trims oversized model output instead of trusting it', async () => {
    const huge = { ...SUMMARY, actionItems: Array.from({ length: 50 }, () => 'x'.repeat(1000)) }
    const result = await summarizeNotes(['a'], {
      apiKey: 'k',
      fetch: fakeGemini(reply(JSON.stringify(huge))),
    })
    if (!result.ok) throw new Error('expected a summary')
    expect(result.summary.actionItems).toHaveLength(12)
    expect(result.summary.actionItems[0]).toHaveLength(160)
  })

  it('returns a labelled stand-in in mock mode', async () => {
    const fetch = fakeGemini({})
    const result = await summarizeNotes(['One', 'Two', 'Three'], { apiKey: 'mock', fetch })
    if (!result.ok) throw new Error('expected a summary')
    expect(result.summary.summary).toContain('Mock')
    expect(result.summary.actionItems).toHaveLength(3)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('collectNotes', () => {
  function board(shapes: Record<string, unknown>[]) {
    const doc = new Y.Doc()
    shapes.forEach((shape, i) => {
      const map = new Y.Map<unknown>()
      for (const [key, value] of Object.entries(shape)) map.set(key, value)
      doc.getMap('shapes').set(`s${i}`, map)
    })
    return doc
  }

  it('puts sticky notes first and skips shapes without text', () => {
    const doc = board([
      { type: 'rect', text: 'Box label' },
      { type: 'sticky', text: '  Talk to\nfive   users ' },
      { type: 'pen', text: '' },
      { type: 'sticky', text: 42 },
    ])
    expect(collectNotes(doc)).toEqual(['Talk to five users', 'Box label'])
  })

  it('caps how much text is sent', () => {
    const doc = board(
      Array.from({ length: 300 }, () => ({ type: 'sticky', text: 'x'.repeat(900) })),
    )
    const notes = collectNotes(doc)
    expect(notes[0]).toHaveLength(500)
    expect(notes.join('').length).toBeLessThanOrEqual(12_000)
  })
})
