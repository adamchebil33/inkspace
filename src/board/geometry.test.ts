import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  handleAt,
  hitTest,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  screenToWorld,
  topShapeAt,
  unionRects,
  worldToScreen,
  zoomAt,
  type Camera,
} from './geometry'

describe('camera', () => {
  const camera: Camera = { x: 100, y: -50, zoom: 2 }

  it('round-trips between screen and world space', () => {
    const screen = { x: 320, y: 240 }
    expect(worldToScreen(camera, screenToWorld(camera, screen))).toEqual(screen)
    expect(screenToWorld(camera, { x: 0, y: 0 })).toEqual({ x: 100, y: -50 })
  })

  it('keeps the point under the cursor fixed while zooming', () => {
    const cursor = { x: 300, y: 200 }
    const before = screenToWorld(camera, cursor)
    const zoomed = zoomAt(camera, cursor, 3.5)
    const after = screenToWorld(zoomed, cursor)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(zoomed.zoom).toBe(3.5)
  })

  it('clamps zoom to the allowed range', () => {
    expect(zoomAt(camera, { x: 0, y: 0 }, 1000).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(camera, { x: 0, y: 0 }, 0).zoom).toBe(MIN_ZOOM)
  })
})

describe('rects', () => {
  it('builds a rect from any two corners', () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 4, y: 50 })).toEqual({
      x: 4,
      y: 20,
      w: 6,
      h: 30,
    })
  })

  it('detects intersection', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 }
    expect(rectsIntersect(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
    expect(rectsIntersect(a, { x: 11, y: 0, w: 5, h: 5 })).toBe(false)
  })

  it('unions rects, and returns null for none', () => {
    expect(unionRects([])).toBeNull()
    expect(
      unionRects([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 20, y: -5, w: 5, h: 5 },
      ]),
    ).toEqual({ x: 0, y: -5, w: 25, h: 15 })
  })
})

describe('hit testing', () => {
  const box = { x: 0, y: 0, w: 100, h: 100 }

  it('treats the corner of an ellipse as empty', () => {
    const corner = { x: 5, y: 5 }
    expect(hitTest({ ...box, type: 'rect' }, corner)).toBe(true)
    expect(hitTest({ ...box, type: 'ellipse' }, corner)).toBe(false)
    expect(hitTest({ ...box, type: 'ellipse' }, { x: 50, y: 50 })).toBe(true)
  })

  it('picks the topmost shape', () => {
    const shapes = [
      { ...box, type: 'rect', id: 'bottom' },
      { ...box, x: 50, type: 'rect', id: 'top' },
    ]
    expect(topShapeAt(shapes, { x: 75, y: 50 })?.id).toBe('top')
    expect(topShapeAt(shapes, { x: 25, y: 50 })?.id).toBe('bottom')
    expect(topShapeAt(shapes, { x: 500, y: 50 })).toBeUndefined()
  })

  it('finds resize handles within tolerance', () => {
    expect(handleAt(box, { x: 98, y: 102 }, 4)).toBe('se')
    expect(handleAt(box, { x: 50, y: 1 }, 4)).toBe('n')
    expect(handleAt(box, { x: 50, y: 50 }, 4)).toBeNull()
  })
})

describe('resizeRect', () => {
  const original = { x: 0, y: 0, w: 100, h: 50 }

  it('moves only the dragged edges', () => {
    expect(resizeRect(original, 'se', 20, 10)).toEqual({
      x: 0,
      y: 0,
      w: 120,
      h: 60,
    })
    expect(resizeRect(original, 'nw', 20, 10)).toEqual({
      x: 20,
      y: 10,
      w: 80,
      h: 40,
    })
    expect(resizeRect(original, 'e', 20, 999)).toEqual({
      x: 0,
      y: 0,
      w: 120,
      h: 50,
    })
  })

  it('stops at the minimum size instead of flipping', () => {
    expect(resizeRect(original, 'w', 500, 0, { minSize: 8 })).toEqual({
      x: 92,
      y: 0,
      w: 8,
      h: 50,
    })
    expect(resizeRect(original, 'se', -500, -500, { minSize: 8 })).toEqual({
      x: 0,
      y: 0,
      w: 8,
      h: 8,
    })
  })

  it('keeps the aspect ratio on corner handles, anchored at the opposite corner', () => {
    expect(resizeRect(original, 'se', 100, 0, { keepAspect: true })).toEqual({
      x: 0,
      y: 0,
      w: 200,
      h: 100,
    })
    expect(resizeRect(original, 'nw', -100, 0, { keepAspect: true })).toEqual({
      x: -100,
      y: -50,
      w: 200,
      h: 100,
    })
  })
})
