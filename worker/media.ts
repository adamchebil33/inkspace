// Files under /media/ (the demo video and its poster) live with the other
// static assets, but reach the Worker first so that byte-range requests work.
// The assets layer answers a Range request with the whole file and a 200, and
// Safari will not play a video served that way: it asks for bytes 0-1 first
// and gives up unless it gets a 206 back.

export type ByteRange = { start: number; end: number }

/**
 * Reads a `Range` header for a file of `size` bytes. Returns the range to send
 * (`end` inclusive), `'unsatisfiable'` for a range that starts past the end of
 * the file, or `null` to ignore the header and send the whole file. Only a
 * single range is supported; asking for several gets the whole file, which
 * the HTTP spec allows.
 */
export function parseRange(header: string, size: number): ByteRange | 'unsatisfiable' | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, from, to] = match
  if (from === '' && to === '') return null

  if (from === '') {
    // "bytes=-500": the last 500 bytes.
    const length = Number(to)
    if (length === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - length), end: size - 1 }
  }

  const start = Number(from)
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1)
  if (start >= size) return 'unsatisfiable'
  if (end < start) return null
  return { start, end }
}

export async function serveMedia(request: Request, assets: Fetcher): Promise<Response> {
  // Ask the assets layer for the whole file, keeping headers like If-None-Match.
  const headers = new Headers(request.headers)
  headers.delete('Range')
  const file = await assets.fetch(new Request(request.url, { method: request.method, headers }))

  const range = request.headers.get('Range')
  if (file.status !== 200 || request.method !== 'GET' || !range) {
    const response = new Response(file.body, file)
    if (file.status === 200) response.headers.set('Accept-Ranges', 'bytes')
    return response
  }

  const body = await file.arrayBuffer()
  const size = body.byteLength
  const parsed = parseRange(range, size)
  const out = new Headers(file.headers)
  out.set('Accept-Ranges', 'bytes')
  out.delete('Content-Length')

  if (parsed === null) return new Response(body, { status: 200, headers: out })
  if (parsed === 'unsatisfiable') {
    out.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers: out })
  }
  out.set('Content-Range', `bytes ${parsed.start}-${parsed.end}/${size}`)
  return new Response(body.slice(parsed.start, parsed.end + 1), { status: 206, headers: out })
}
