import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { BoardStore } from './store'
import type { Shape } from './types'

const shape = (overrides: Partial<Shape> = {}): Shape => ({
  id: 'a',
  type: 'rect',
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  color: 'blue',
  text: '',
  z: 1,
  ...overrides,
})

/** Two stores that exchange every update, like two browsers on one board. */
function connectedPair() {
  const a = new BoardStore()
  const b = new BoardStore()
  a.doc.on('update', (update: Uint8Array) => Y.applyUpdate(b.doc, update))
  b.doc.on('update', (update: Uint8Array) => Y.applyUpdate(a.doc, update))
  return [a, b] as const
}

describe('BoardStore', () => {
  it('adds, updates and removes shapes', () => {
    const store = new BoardStore()
    store.add(shape())
    store.update('a', { x: 40, text: 'hello' })
    expect(store.get('a')).toMatchObject({
      x: 40,
      text: 'hello',
      color: 'blue',
    })

    store.remove(['a'])
    expect(store.list()).toEqual([])
  })

  it('lists shapes in stacking order', () => {
    const store = new BoardStore()
    store.add(shape({ id: 'top', z: 5 }))
    store.add(shape({ id: 'bottom', z: -2 }))
    store.add(shape({ id: 'middle', z: 1 }))
    expect(store.list().map((s) => s.id)).toEqual(['bottom', 'middle', 'top'])
    expect(store.topZ()).toBe(6)
    expect(store.bottomZ()).toBe(-3)
  })

  it('notifies subscribers once per transaction', () => {
    const store = new BoardStore()
    let calls = 0
    store.subscribe(() => calls++)
    store.transact(() => {
      store.add(shape({ id: 'a' }))
      store.add(shape({ id: 'b' }))
    })
    expect(calls).toBe(1)
  })

  it('ignores malformed shapes written by another client', () => {
    const store = new BoardStore()
    store.add(shape({ id: 'good' }))
    const bad = new Y.Map<unknown>()
    bad.set('type', 'rect')
    bad.set('x', 'not a number')
    store.doc.getMap('shapes').set('bad', bad)
    expect(store.list().map((s) => s.id)).toEqual(['good'])
  })
})

describe('two clients', () => {
  it("see each other's changes", () => {
    const [a, b] = connectedPair()
    a.add(shape())
    expect(b.get('a')).toMatchObject({ type: 'rect', w: 100 })
    b.remove(['a'])
    expect(a.list()).toEqual([])
  })

  it('merge concurrent edits to different properties of one shape', () => {
    const a = new BoardStore()
    a.add(shape())
    const b = new BoardStore()
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))

    // Offline from each other: one moves the shape, the other recolours it.
    a.update('a', { x: 300, y: 200 })
    b.update('a', { color: 'pink' })

    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc))

    const expected = { x: 300, y: 200, color: 'pink' }
    expect(a.get('a')).toMatchObject(expected)
    expect(b.get('a')).toMatchObject(expected)
  })

  it('converge when both edit the same property', () => {
    const a = new BoardStore()
    a.add(shape())
    const b = new BoardStore()
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))

    a.update('a', { text: 'from a' })
    b.update('a', { text: 'from b' })
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc))

    expect(a.get('a')?.text).toBe(b.get('a')?.text)
  })
})
