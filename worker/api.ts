import { BOARD_ID_PATTERN } from '../shared/boardKey'

// HTTP routing for /api/*. Static files are served by the assets layer and
// never reach this code (see wrangler.jsonc).

const json = (body: unknown, status = 200) => Response.json(body, { status })

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

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

  return json({ error: 'Not found' }, 404)
}
