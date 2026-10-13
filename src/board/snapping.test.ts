import { describe, expect, it } from 'vitest'
import { snapMove, snapPoint, snapResize } from './snapping'

// A target 100x100 at the origin: its lines are x = 0, 50, 100 and y = 0, 50, 100.
const target = { x: 0, y: 0, w: 100, h: 100 }

describe('snapMove', () => {
  it('pulls a nearby edge onto a target edge and shows a guide spanning both', () => {
    // Left edge at 103, close to the target's right edge at 100.
    const snap = snapMove({ x: 103, y: 300, w: 80, h: 40 }, [target], 6)
    expect(snap.dx).toBe(-3)
    expect(snap.dy).toBe(0)
    expect(snap.guides).toEqual([{ axis: 'x', at: 100, from: 0, to: 340 }])
  })

  it('aligns centres as well as edges', () => {
    // Middle at 52 against the target's middle at 50.
    const snap = snapMove({ x: 300, y: 32, w: 40, h: 40 }, [target], 6)
    expect(snap.dy).toBe(-2)
    expect(snap.guides).toEqual([{ axis: 'y', at: 50, from: 0, to: 340 }])
  })

  it('picks the closest line when several are in range', () => {
    const other = { x: 205, y: 0, w: 10, h: 10 }
    const snap = snapMove({ x: 102, y: 500, w: 100, h: 10 }, [target, other], 6)
    // Left edge 102 is 2 from 100; right edge 202 is 3 from 205.
    expect(snap.dx).toBe(-2)
  })

  it('leaves the box alone when nothing is close', () => {
    expect(snapMove({ x: 120, y: 120, w: 10, h: 10 }, [target], 6)).toEqual({
      dx: 0,
      dy: 0,
      guides: [],
    })
  })

  it('merges guides from several targets on the same line', () => {
    const below = { x: 0, y: 500, w: 100, h: 100 }
    const snap = snapMove({ x: 2, y: 250, w: 50, h: 50 }, [target, below], 6)
    const left = snap.guides.find((g) => g.axis === 'x' && g.at === 0)
    expect(left).toEqual({ axis: 'x', at: 0, from: 0, to: 600 })
  })
})

describe('snapResize', () => {
  it('snaps only the edge being dragged', () => {
    // Dragging the right edge to 97: snaps to 100, left edge untouched.
    const { rect, guides } = snapResize({ x: 30, y: 200, w: 67, h: 50 }, 'e', [target], 6)
    expect(rect).toEqual({ x: 30, y: 200, w: 70, h: 50 })
    expect(guides).toEqual([{ axis: 'x', at: 100, from: 0, to: 250 }])
  })

  it('moves the left edge and keeps the right one fixed', () => {
    const { rect } = snapResize({ x: 53, y: 200, w: 100, h: 50 }, 'w', [target], 6)
    expect(rect).toEqual({ x: 50, y: 200, w: 103, h: 50 })
  })

  it('snaps both edges of a corner handle', () => {
    const { rect, guides } = snapResize({ x: 200, y: 200, w: -1 + 1, h: 0 }, 'nw', [target], 6)
    expect(rect).toEqual({ x: 200, y: 200, w: 0, h: 0 })
    expect(guides).toEqual([])
    const corner = snapResize({ x: 300, y: 300, w: 0, h: 0 }, 'se', [target], 6)
    expect(corner.guides).toEqual([])
  })

  it('does not snap below the minimum size', () => {
    // Snapping the right edge from 104 back to 100 would leave width 4.
    const { rect } = snapResize({ x: 96, y: 200, w: 8, h: 50 }, 'e', [target], 6, 8)
    expect(rect.w).toBe(8)
  })
})

describe('snapPoint', () => {
  it('snaps a point on each axis independently', () => {
    const { point, guides } = snapPoint({ x: 48, y: 204 }, [target], 6)
    expect(point).toEqual({ x: 50, y: 204 })
    expect(guides).toEqual([{ axis: 'x', at: 50, from: 0, to: 204 }])
  })
})
