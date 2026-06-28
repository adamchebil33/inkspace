import { describe, expect, it } from 'vitest'
import { handleRequest } from './api'

const call = (path: string, headers?: HeadersInit) =>
  handleRequest(new Request(`http://localhost${path}`, { headers }), {} as Env)

const limiter = (success: boolean) =>
  ({ AI_LIMITER: { limit: async () => ({ success }) } }) as unknown as Env

describe('summary route', () => {
  const post = (path: string, env: Env) =>
    handleRequest(new Request(`http://localhost${path}`, { method: 'POST' }), env)

  it('only accepts POST to a valid board', async () => {
    expect((await call('/api/boards/abcdefgh1234/summary')).status).toBe(405)
    expect((await post('/api/boards/no/summary', limiter(true))).status).toBe(400)
  })

  it('turns away a visitor who is over the limit before doing any work', async () => {
    const res = await post('/api/boards/abcdefgh1234/summary', limiter(false))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ ok: false, error: 'rate_limited' })
  })
})

describe('api', () => {
  it('reports healthy', async () => {
    const res = await call('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 404 for unknown API routes', async () => {
    expect((await call('/api/nope')).status).toBe(404)
  })

  it('rejects malformed board ids', async () => {
    const res = await call('/api/ws/no', { Upgrade: 'websocket' })
    expect(res.status).toBe(400)
  })

  it('requires a WebSocket upgrade on the sync route', async () => {
    expect((await call('/api/ws/abcdefgh1234')).status).toBe(426)
  })
})
