import { describe, expect, it } from 'vitest'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { encodeAwarenessRemoval, readAwarenessUpdate } from './awareness'

describe('awareness helpers', () => {
  it('reads client ids and clocks from a real awareness update', () => {
    const awareness = new Awareness(new Y.Doc())
    awareness.setLocalState({ name: 'Ada' })
    awareness.setLocalState({ name: 'Ada', cursor: { x: 1, y: 2 } })

    const update = encodeAwarenessUpdate(awareness, [awareness.clientID])
    const [entry] = readAwarenessUpdate(update)
    expect(entry).toEqual({
      clientId: awareness.clientID,
      clock: awareness.meta.get(awareness.clientID)!.clock,
      removed: false,
    })
  })

  it('flags a client that removed its own state', () => {
    const awareness = new Awareness(new Y.Doc())
    awareness.setLocalState(null)
    const update = encodeAwarenessUpdate(awareness, [awareness.clientID])
    expect(readAwarenessUpdate(update)[0]?.removed).toBe(true)
  })

  it('builds a removal that other clients accept', () => {
    const leaving = new Awareness(new Y.Doc())
    leaving.setLocalState({ name: 'Ada' })
    const update = encodeAwarenessUpdate(leaving, [leaving.clientID])

    const peer = new Awareness(new Y.Doc())
    applyAwarenessUpdate(peer, update, 'test')
    expect(peer.getStates().has(leaving.clientID)).toBe(true)

    const { clientId, clock } = readAwarenessUpdate(update)[0]!
    applyAwarenessUpdate(peer, encodeAwarenessRemoval({ [clientId]: clock }), 'test')
    expect(peer.getStates().has(leaving.clientID)).toBe(false)
  })
})
