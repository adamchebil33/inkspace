import { describe, expect, it } from 'vitest'
import { parseRange, serveMedia } from './media'

describe('parseRange', () => {
  it('reads a closed range, an open one and a suffix', () => {
    expect(parseRange('bytes=0-1', 100)).toEqual({ start: 0, end: 1 })
    expect(parseRange('bytes=10-', 100)).toEqual({ start: 10, end: 99 })
    expect(parseRange('bytes=-30', 100)).toEqual({ start: 70, end: 99 })
  })

  it('clamps an end past the file to its last byte', () => {
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 })
  })

  it('rejects a start past the end of the file', () => {
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable')
    expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable')
  })

  it('ignores headers it does not understand, including several ranges', () => {
    expect(parseRange('bytes=0-1,5-9', 100)).toBeNull()
    expect(parseRange('items=0-1', 100)).toBeNull()
    expect(parseRange('bytes=-', 100)).toBeNull()
    expect(parseRange('bytes=9-3', 100)).toBeNull()
  })
})

describe('serveMedia', () => {
  const content = new Uint8Array(Array.from({ length: 100 }, (_, i) => i))
  const seen: Request[] = []
  const assets = {
    fetch: async (input: Request) => {
      seen.push(input)
      return new Response(input.method === 'HEAD' ? null : content, {
        headers: { 'Content-Type': 'video/mp4', ETag: '"abc"' },
      })
    },
  } as unknown as Fetcher
  const get = (headers?: HeadersInit, method = 'GET') =>
    serveMedia(new Request('http://localhost/media/demo.mp4', { method, headers }), assets)

  it('answers a range request with just those bytes', async () => {
    const res = await get({ Range: 'bytes=0-1' })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-1/100')
    expect(res.headers.get('Content-Type')).toBe('video/mp4')
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0, 1])
    // The assets layer itself is asked for the whole file.
    expect(seen.at(-1)!.headers.has('Range')).toBe(false)
  })

  it('sends the whole file, saying ranges are welcome, when none is asked for', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect((await res.arrayBuffer()).byteLength).toBe(100)
  })

  it('refuses a range past the end', async () => {
    const res = await get({ Range: 'bytes=200-' })
    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe('bytes */100')
  })

  it('passes conditional headers on, so unchanged files can be answered with a 304', async () => {
    await get({ 'If-None-Match': '"abc"' })
    expect(seen.at(-1)!.headers.get('If-None-Match')).toBe('"abc"')
  })
})
