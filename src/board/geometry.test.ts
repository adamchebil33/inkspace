import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  arrowEnds,
  arrowFromEnds,
  boundaryPoint,
  distanceToSegment,
  handlesFor,
  pointsSize,
  simplifyPoints,
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

describe('lines', () => {
  it('measures distance to a segment, including past its ends', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 0 }
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3)
    expect(distanceToSegment({ x: 14, y: 3 }, a, b)).toBe(5)
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBe(5)
  })

  it('hits a pen stroke near its line, not anywhere in its box', () => {
    // An L shape: down the left edge, then along the bottom.
    const pen = { type: 'pen', x: 100, y: 100, w: 50, h: 50, points: [0, 0, 0, 50, 50, 50] }
    expect(hitTest(pen, { x: 102, y: 120 }, 4)).toBe(true)
    expect(hitTest(pen, { x: 130, y: 152 }, 4)).toBe(true)
    expect(hitTest(pen, { x: 135, y: 115 }, 4)).toBe(false)
  })

  it('hits a resized pen stroke where it is drawn', () => {
    // Same stroke stretched to twice the size.
    const pen = { type: 'pen', x: 0, y: 0, w: 100, h: 100, points: [0, 0, 0, 50, 50, 50] }
    expect(hitTest(pen, { x: 80, y: 99 }, 4)).toBe(true)
    expect(hitTest(pen, { x: 40, y: 50 }, 4)).toBe(false)
  })

  it('simplifies a stroke without moving it by more than the tolerance', () => {
    // A nearly straight line with small wobbles, then a sharp corner.
    const raw = [0, 0, 10, 0.2, 20, -0.2, 30, 0.1, 40, 0, 40, 30]
    expect(simplifyPoints(raw, 0.5)).toEqual([0, 0, 40, 0, 40, 30])
    expect(simplifyPoints(raw, 0.05)).toEqual(raw)
    expect(simplifyPoints([1, 2, 3, 4], 10)).toEqual([1, 2, 3, 4])
  })

  it('measures the extent of relative points', () => {
    expect(pointsSize([0, 5, 30, 0, 12, 20])).toEqual({ w: 30, h: 20 })
  })
})

describe('arrows', () => {
  it('round-trips between two ends and a flipped bounding box', () => {
    const start = { x: 100, y: 20 }
    const end = { x: 40, y: 80 }
    const box = arrowFromEnds(start, end)
    expect(box).toEqual({ x: 40, y: 20, w: 60, h: 60, flipX: true, flipY: false })
    expect(arrowEnds(box)).toEqual({ start, end })
  })

  it('is hit along its line only', () => {
    const arrow = { type: 'arrow', ...arrowFromEnds({ x: 0, y: 0 }, { x: 100, y: 100 }) }
    expect(hitTest(arrow, { x: 50, y: 52 }, 5)).toBe(true)
    expect(hitTest(arrow, { x: 90, y: 10 }, 5)).toBe(false)
  })

  it('offers no box handles for arrows and corners only for text', () => {
    expect(handlesFor('arrow')).toEqual([])
    expect(handlesFor('text')).toEqual(['nw', 'ne', 'se', 'sw'])
    expect(handlesFor('rect')).toHaveLength(8)
  })
})

describe('boundaryPoint', () => {
  const box = { type: 'rect', x: 0, y: 0, w: 100, h: 60 }

  it('finds where a line from the centre leaves a rectangle', () => {
    expect(boundaryPoint(box, { x: 500, y: 30 })).toEqual({ x: 100, y: 30 })
    expect(boundaryPoint(box, { x: 50, y: -400 })).toEqual({ x: 50, y: 0 })
    // Toward the far bottom-right, it exits through the bottom edge.
    const corner = boundaryPoint(box, { x: 150, y: 230 })
    expect(corner.y).toBeCloseTo(60)
    expect(corner.x).toBeCloseTo(65)
  })

  it('follows the curve of an ellipse', () => {
    const circle = { type: 'ellipse', x: 0, y: 0, w: 100, h: 100 }
    const p = boundaryPoint(circle, { x: 150, y: 150 })
    // On the circle of radius 50 around (50, 50), toward the diagonal.
    expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(50)
    expect(p.x).toBeCloseTo(p.y)
  })

  it('leaves a gap outside the shape', () => {
    expect(boundaryPoint(box, { x: 500, y: 30 }, 6)).toEqual({ x: 106, y: 30 })
  })

  it('does not overshoot a point that is inside the shape', () => {
    expect(boundaryPoint(box, { x: 60, y: 30 }, 6)).toEqual({ x: 60, y: 30 })
    expect(boundaryPoint(box, { x: 50, y: 30 })).toEqual({ x: 50, y: 30 })
  })
})
