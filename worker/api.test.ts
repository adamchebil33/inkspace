import { describe, expect, it } from 'vitest'
import { handleRequest } from './api'

const call = (path: string, headers?: HeadersInit) =>
  handleRequest(new Request(`http://localhost${path}`, { headers }), {} as Env)

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
