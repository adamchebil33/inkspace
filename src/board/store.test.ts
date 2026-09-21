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
    // Once for the change, once more because undo just became available.
    expect(calls).toBe(2)
    store.transact(() => store.update('a', { x: 5 }))
    expect(calls).toBe(3)
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

  it('merge text typed into the same note at the same time', () => {
    const a = new BoardStore()
    a.add(shape({ text: 'Buy milk' }))
    const b = new BoardStore()
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))

    // Offline from each other: one adds to the start, the other to the end.
    a.update('a', { text: 'TODO: Buy milk' })
    b.update('a', { text: 'Buy milk and eggs' })

    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc))

    expect(a.get('a')?.text).toBe('TODO: Buy milk and eggs')
    expect(b.get('a')?.text).toBe('TODO: Buy milk and eggs')
  })

  it('still reads and upgrades text saved as a plain string', () => {
    const store = new BoardStore()
    store.add(shape())
    const map = store.doc.getMap('shapes').get('a') as Y.Map<unknown>
    map.set('text', 'old format')
    expect(store.get('a')?.text).toBe('old format')

    store.update('a', { text: 'old format, edited' })
    expect(map.get('text')).toBeInstanceOf(Y.Text)
    expect(store.get('a')?.text).toBe('old format, edited')
  })

  it('undoes typing', () => {
    const store = new BoardStore()
    store.add(shape({ text: 'one' }))
    store.commit()
    store.update('a', { text: 'one two' })
    store.undo()
    expect(store.get('a')?.text).toBe('one')
  })

  it('converge when both edit the same property', () => {
    const a = new BoardStore()
    a.add(shape())
    const b = new BoardStore()
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))

    a.update('a', { color: 'red' })
    b.update('a', { color: 'green' })
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc))

    expect(a.get('a')?.color).toBe(b.get('a')?.color)
  })
})

describe('pen strokes', () => {
  it('stores points compactly and reads them back', () => {
    const [a, b] = connectedPair()
    a.add(shape({ type: 'pen', points: [0, 0, 12.34, 5.67] }))

    expect(b.get('a')?.points).toEqual([0, 0, 12.3, 5.7])
    // On the wire they are whole numbers (tenths of a unit).
    const raw = (b.doc.getMap('shapes').get('a') as Y.Map<unknown>).get('points')
    expect(raw).toEqual([0, 0, 123, 57])
  })

  it('keeps the same points array across unrelated changes', () => {
    const store = new BoardStore()
    store.add(shape({ type: 'pen', points: [0, 0, 10, 10] }))
    const before = store.get('a')!.points
    store.update('a', { x: 500 })
    expect(store.get('a')!.points).toBe(before)
  })

  it('drops a pen shape with broken points', () => {
    const store = new BoardStore()
    store.add(shape({ type: 'pen', points: [0, 0, 10, 10] }))
    ;(store.doc.getMap('shapes').get('a') as Y.Map<unknown>).set('points', [1, 2, 3])
    expect(store.list()).toEqual([])
  })
})

describe('undo', () => {
  it('undoes and redoes local edits', () => {
    const store = new BoardStore()
    store.add(shape())
    store.commit()
    store.update('a', { x: 50 })
    expect(store.canUndo()).toBe(true)

    store.undo()
    expect(store.get('a')?.x).toBe(0)
    store.undo()
    expect(store.list()).toEqual([])
    expect(store.canUndo()).toBe(false)

    store.redo()
    store.redo()
    expect(store.get('a')?.x).toBe(50)
  })

  it('merges quick successive edits into one step', () => {
    const store = new BoardStore()
    store.add(shape())
    store.commit()
    for (let x = 1; x <= 20; x++) store.update('a', { x })
    store.undo()
    expect(store.get('a')?.x).toBe(0)
  })

  it("only undoes this person's own edits", () => {
    const [a, b] = connectedPair()
    a.add(shape({ id: 'from-a' }))
    b.add(shape({ id: 'from-b' }))
    a.commit()
    // A's latest edit is a move; B then recolours the same shape.
    a.update('from-a', { x: 300 })
    b.update('from-a', { color: 'pink' })

    a.undo()
    // A's move is reverted, B's recolour and B's shape are untouched.
    expect(a.get('from-a')).toMatchObject({ x: 0, color: 'pink' })
    expect(b.get('from-a')).toMatchObject({ x: 0, color: 'pink' })
    expect(a.get('from-b')).toBeDefined()

    a.undo()
    expect(b.list().map((s) => s.id)).toEqual(['from-b'])
    expect(a.canUndo()).toBe(false)
  })

  it('tells subscribers when undo becomes available', () => {
    const store = new BoardStore()
    const seen: boolean[] = []
    store.subscribe(() => seen.push(store.canUndo()))
    store.add(shape())
    expect(seen.at(-1)).toBe(true)
  })
})
