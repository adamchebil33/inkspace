import { describe, expect, it } from 'vitest'
import { handleRequest } from './index'

const call = (path: string) => handleRequest(new Request(`http://localhost${path}`))

describe('worker', () => {
  it('reports healthy', async () => {
    const res = await call('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 404 for unknown API routes', async () => {
    const res = await call('/api/nope')
    expect(res.status).toBe(404)
  })
})
