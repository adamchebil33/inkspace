import { describe, expect, it } from 'vitest'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { Editor } from './editor'
import { Follow } from './follow'
import { Presence } from './presence'
import { BoardStore } from './store'

/** Two people on one board, with presence flowing between them instantly. */
function twoPeople() {
  const a = new Awareness(new Y.Doc())
  const b = new Awareness(new Y.Doc())
  const link = (from: Awareness, to: Awareness) =>
    from.on('update', ({ added, updated, removed }: Record<string, number[]>) => {
      const ids = [...added!, ...updated!, ...removed!]
      applyAwarenessUpdate(to, encodeAwarenessUpdate(from, ids), 'remote')
    })
  link(a, b)
  link(b, a)

  const person = (awareness: Awareness, name: string) => {
    const editor = new Editor(new BoardStore())
    const presence = new Presence(awareness, { name, color: '#e03131' })
    // What session.ts does: publish the view on every editor change.
    editor.subscribe(() => presence.setView(editor.getViewRect()))
    editor.setViewport(1000, 800)
    return { editor, presence, follow: new Follow(editor, presence), id: awareness.clientID }
  }
  return { leader: person(a, 'Leader'), follower: person(b, 'Follower') }
}

/** Run frames until the follower's view has settled. */
function settle(follow: Follow) {
  let now = 0
  while (follow.step((now += 16)) && now < 10_000);
}

describe('Follow', () => {
  it("brings the follower's view to what the leader is looking at", () => {
    const { leader, follower } = twoPeople()
    leader.editor.wheel({ x: 0, y: 0, deltaX: 3000, deltaY: 1500, zoom: false })
    leader.editor.setZoom(2)

    follower.follow.start(leader.id)
    expect(follower.follow.getLeader()?.name).toBe('Leader')
    settle(follower.follow)

    // Same screen size, so the cameras end up identical.
    const mine = follower.editor.getState().camera
    const theirs = leader.editor.getState().camera
    expect(mine.x).toBeCloseTo(theirs.x)
    expect(mine.y).toBeCloseTo(theirs.y)
    expect(mine.zoom).toBeCloseTo(theirs.zoom)
  })

  it('eases toward the view instead of jumping', () => {
    const { leader, follower } = twoPeople()
    const start = follower.editor.getState().camera.x
    leader.editor.wheel({ x: 0, y: 0, deltaX: 3000, deltaY: 0, zoom: false })
    follower.follow.start(leader.id)

    expect(follower.follow.step(16)).toBe(true)
    const afterOneFrame = follower.editor.getState().camera.x
    expect(afterOneFrame).toBeGreaterThan(start)
    expect(afterOneFrame).toBeLessThan(leader.editor.getState().camera.x)
  })

  it('fits the whole of a larger view into a smaller screen', () => {
    const { leader, follower } = twoPeople()
    follower.editor.setViewport(500, 400)
    follower.follow.start(leader.id)
    settle(follower.follow)

    // Half the screen in each direction: half the zoom, same centre.
    const view = follower.editor.getViewRect()
    const theirs = leader.editor.getViewRect()
    expect(follower.editor.getState().camera.zoom).toBeCloseTo(0.5)
    expect(view.x + view.w / 2).toBeCloseTo(theirs.x + theirs.w / 2)
  })

  it('stops as soon as the follower moves the view themselves', () => {
    const { leader, follower } = twoPeople()
    follower.follow.start(leader.id)
    follower.editor.wheel({ x: 0, y: 0, deltaX: 10, deltaY: 0, zoom: false })
    expect(follower.presence.getState().following).toBeNull()
    expect(follower.follow.step(16)).toBe(false)
  })

  it('toggles', () => {
    const { leader, follower } = twoPeople()
    follower.follow.toggle(leader.id)
    expect(follower.presence.getState().following).toBe(leader.id)
    follower.follow.toggle(leader.id)
    expect(follower.presence.getState().following).toBeNull()
  })
})
