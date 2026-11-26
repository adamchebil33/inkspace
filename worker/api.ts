import { BOARD_ID_PATTERN } from '../shared/boardKey'
import type { SummaryResponse } from '../shared/summary'
import { serveMedia } from './media'

// HTTP routing for /api/* and /media/*. Other static files are served by the
// assets layer and never reach this code (see wrangler.jsonc).

const json = (body: unknown, status = 200) => Response.json(body, { status })

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  // The demo video, which needs byte ranges (see media.ts).
  if (url.pathname.startsWith('/media/')) {
    return serveMedia(request, env.ASSETS)
  }

  if (url.pathname === '/api/health') {
    return json({ ok: true })
  }

  // Live sync: one Durable Object per board, addressed by the board id.
  if (url.pathname.startsWith('/api/ws/')) {
    const boardId = url.pathname.slice('/api/ws/'.length)
    if (!BOARD_ID_PATTERN.test(boardId)) return json({ error: 'Invalid board id' }, 400)
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'Expected a WebSocket upgrade' }, 426)
    }
    const room = env.BOARD_ROOM.get(env.BOARD_ROOM.idFromName(boardId))
    return room.fetch(request)
  }

  // AI summary of a board. The board's Durable Object does the work; here we
  // only stop one visitor from hammering the endpoint.
  const summary = /^\/api\/boards\/([^/]+)\/summary$/.exec(url.pathname)
  if (summary) {
    const boardId = summary[1]!
    if (!BOARD_ID_PATTERN.test(boardId)) return json({ error: 'Invalid board id' }, 400)
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405)

    const visitor = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const { success } = await env.AI_LIMITER.limit({ key: visitor })
    if (!success) {
      const body: SummaryResponse = { ok: false, error: 'rate_limited', retryAfterSeconds: 60 }
      return json(body, 429)
    }
    const room = env.BOARD_ROOM.get(env.BOARD_ROOM.idFromName(boardId))
    return room.fetch(request)
  }

  return json({ error: 'Not found' }, 404)
}
