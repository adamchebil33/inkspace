import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { CURSOR_INTERVAL_MS, CursorSmoother, Presence, parsePeer, type Peer } from './presence'

const ada = { name: 'Ada', color: '#e03131' }
const bob = { name: 'Bob', color: '#1c7ed6' }

/** Two awareness instances that forward every update to each other. */
function connectedPair() {
  const a = new Awareness(new Y.Doc())
  const b = new Awareness(new Y.Doc())
  const link = (from: Awareness, to: Awareness) =>
    from.on('update', ({ added, updated, removed }: Record<string, number[]>) => {
      const ids = [...added!, ...updated!, ...removed!]
      applyAwarenessUpdate(to, encodeAwarenessUpdate(from, ids), 'remote')
    })
  link(a, b)
  link(b, a)
  return [a, b] as const
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Presence', () => {
  it('shows other people, but not yourself', () => {
    const [a, b] = connectedPair()
    const adaPresence = new Presence(a, ada)
    const bobPresence = new Presence(b, bob)

    expect(adaPresence.getState().peers).toMatchObject([{ name: 'Bob', color: '#1c7ed6' }])
    expect(bobPresence.getState().peers).toMatchObject([{ name: 'Ada', cursor: null }])
  })

  it('shares cursor, selection and renames', () => {
    const [a, b] = connectedPair()
    const adaPresence = new Presence(a, ada)
    const bobPresence = new Presence(b, bob)

    adaPresence.setCursor({ x: 10.04, y: -20 })
    adaPresence.setSelection(['shape1'])
    adaPresence.setUser({ ...ada, name: 'Ada L.' })

    expect(bobPresence.getState().peers[0]).toMatchObject({
      name: 'Ada L.',
      cursor: { x: 10, y: -20 },
      selection: ['shape1'],
    })
  })

  it('throttles cursor updates but always delivers the last position', () => {
    const [a, b] = connectedPair()
    const adaPresence = new Presence(a, ada)
    const bobPresence = new Presence(b, bob)
    let updates = 0
    a.on('update', () => updates++)

    for (let x = 1; x <= 30; x++) adaPresence.setCursor({ x, y: 0 })
    expect(updates).toBe(1)
    expect(bobPresence.getState().peers[0]?.cursor).toEqual({ x: 1, y: 0 })

    vi.advanceTimersByTime(CURSOR_INTERVAL_MS)
    expect(updates).toBe(2)
    expect(bobPresence.getState().peers[0]?.cursor).toEqual({ x: 30, y: 0 })

    // Nothing new to say: no further messages.
    vi.advanceTimersByTime(CURSOR_INTERVAL_MS * 10)
    expect(updates).toBe(2)
  })

  it('shares a pen stroke while it is being drawn, then clears it', () => {
    const [a, b] = connectedPair()
    const adaPresence = new Presence(a, ada)
    const bobPresence = new Presence(b, bob)
    const points = [0, 0, 10.4, 5.6]

    adaPresence.setDraft({ color: 'red', points })
    adaPresence.setCursor({ x: 10.4, y: 5.6 })
    expect(bobPresence.getState().peers[0]?.draft).toEqual({
      color: 'red',
      points: [0, 0, 10, 6],
    })

    // The stroke grows in place; the next tick picks up the new points.
    points.push(20, 20)
    vi.advanceTimersByTime(CURSOR_INTERVAL_MS)
    expect(bobPresence.getState().peers[0]?.draft?.points).toHaveLength(6)

    adaPresence.setDraft(null)
    expect(bobPresence.getState().peers[0]?.draft).toBeNull()
  })

  it('shares a view only while someone is following it', () => {
    const [a, b] = connectedPair()
    const adaPresence = new Presence(a, ada)
    const bobPresence = new Presence(b, bob)
    const view = { x: 10, y: 20, w: 800, h: 600 }

    // Nobody follows Ada: panning around costs no messages.
    let updates = 0
    a.on('update', () => updates++)
    adaPresence.setView(view)
    vi.advanceTimersByTime(CURSOR_INTERVAL_MS * 3)
    expect(updates).toBe(0)
    expect(bobPresence.getState().peers[0]?.view).toBeNull()

    // Bob follows: Ada's view goes out, and keeps up as it changes.
    bobPresence.setFollowing(a.clientID)
    expect(bobPresence.getState().following).toBe(a.clientID)
    expect(bobPresence.getState().peers[0]?.view).toEqual(view)
    adaPresence.setView({ ...view, x: 500 })
    vi.advanceTimersByTime(CURSOR_INTERVAL_MS)
    expect(bobPresence.getState().peers[0]?.view).toMatchObject({ x: 500 })

    // Bob stops: Ada stops sharing.
    bobPresence.setFollowing(null)
    vi.advanceTimersByTime(CURSOR_INTERVAL_MS)
    expect(bobPresence.getState().peers[0]?.view).toBeNull()
  })

  it('sends the cursor, stroke and view that changed together as one update', () => {
    const [a, b] = connectedPair()
    const adaPresence = new Presence(a, ada)
    const bobPresence = new Presence(b, bob)
    bobPresence.setFollowing(a.clientID)
    vi.advanceTimersByTime(CURSOR_INTERVAL_MS)

    // The first change goes out at once and opens a 50 ms window.
    adaPresence.setCursor({ x: 1, y: 1 })
    let updates = 0
    a.on('update', () => updates++)

    // Everything that changes inside the window is sent together at its end.
    adaPresence.setDraft({ color: 'red', points: [0, 0, 5, 5] })
    adaPresence.setView({ x: 1, y: 2, w: 3, h: 4 })
    adaPresence.setCursor({ x: 5, y: 5 })
    expect(updates).toBe(0)
    vi.advanceTimersByTime(CURSOR_INTERVAL_MS)
    expect(updates).toBe(1)
    expect(bobPresence.getState().peers[0]).toMatchObject({
      cursor: { x: 5, y: 5 },
      draft: { color: 'red' },
      view: { w: 3 },
    })
  })

  it('stops following someone who leaves', () => {
    const [a, b] = connectedPair()
    new Presence(a, ada)
    const bobPresence = new Presence(b, bob)
    bobPresence.setFollowing(a.clientID)
    a.setLocalState(null)
    expect(bobPresence.getState().following).toBeNull()
  })

  it('removes people when they leave', () => {
    const [a, b] = connectedPair()
    new Presence(a, ada)
    const bobPresence = new Presence(b, bob)
    a.setLocalState(null)
    expect(bobPresence.getState().peers).toEqual([])
  })
})

describe('parsePeer', () => {
  it('rejects malformed presence', () => {
    expect(parsePeer(1, null)).toBeNull()
    expect(parsePeer(1, {})).toBeNull()
    expect(parsePeer(1, { user: { name: 'x', color: 'red; background: url(evil)' } })).toBeNull()
  })

  it('tolerates a bad cursor or selection', () => {
    const peer = parsePeer(1, { user: ada, cursor: { x: 'NaN' }, selection: 'nope' })
    expect(peer).toMatchObject({ name: 'Ada', cursor: null, selection: [], draft: null })
    expect(
      parsePeer(1, { user: ada, following: 'x', view: { x: 0, y: 0, w: 0, h: 5 } }),
    ).toMatchObject({
      following: null,
      view: null,
    })
    expect(parsePeer(1, { user: ada, draft: { color: 'nope', points: [0, 0] } })?.draft).toBeNull()
    expect(parsePeer(1, { user: ada, draft: { color: 'red', points: [0, 'x'] } })?.draft).toBeNull()
  })
})

describe('CursorSmoother', () => {
  const peer = (x: number): Peer => ({
    id: 1,
    ...ada,
    cursor: { x, y: 0 },
    selection: [],
    draft: null,
    following: null,
    view: null,
  })

  it('snaps to the first position, then eases toward new ones', () => {
    const smoother = new CursorSmoother()
    expect(smoother.step([peer(0)], 0)).toMatchObject({ animating: false })

    const first = smoother.step([peer(100)], 16)
    expect(first.animating).toBe(true)
    expect(first.peers[0]!.cursor!.x).toBeGreaterThan(0)
    expect(first.peers[0]!.cursor!.x).toBeLessThan(100)

    let last = first
    for (let t = 32; t < 2000; t += 16) last = smoother.step([peer(100)], t)
    expect(last.animating).toBe(false)
    expect(last.peers[0]!.cursor!.x).toBe(100)
  })
})
