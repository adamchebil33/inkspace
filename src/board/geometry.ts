// Pure geometry for the board: camera maths, hit-testing and resizing.
// Nothing here touches the DOM, so all of it is unit tested.

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** `x`/`y` is the world position shown at the top-left of the screen. */
export interface Camera {
  x: number
  y: number
  zoom: number
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

export function screenToWorld(camera: Camera, p: Point): Point {
  return { x: p.x / camera.zoom + camera.x, y: p.y / camera.zoom + camera.y }
}

export function worldToScreen(camera: Camera, p: Point): Point {
  return {
    x: (p.x - camera.x) * camera.zoom,
    y: (p.y - camera.y) * camera.zoom,
  }
}

/** Zoom so that the world point under `screen` stays under it. */
export function zoomAt(camera: Camera, screen: Point, zoom: number): Camera {
  const next = clampZoom(zoom)
  const anchor = screenToWorld(camera, screen)
  return {
    x: anchor.x - screen.x / next,
    y: anchor.y - screen.y / next,
    zoom: next,
  }
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  const first = rects[0]
  if (!first) return null
  let left = first.x
  let top = first.y
  let right = first.x + first.w
  let bottom = first.y + first.h
  for (const r of rects) {
    left = Math.min(left, r.x)
    top = Math.min(top, r.y)
    right = Math.max(right, r.x + r.w)
    bottom = Math.max(bottom, r.y + r.h)
  }
  return { x: left, y: top, w: right - left, h: bottom - top }
}

interface Hittable extends Rect {
  type: string
  points?: readonly number[]
  flipX?: boolean
  flipY?: boolean
}

/**
 * Is `p` on the shape? `tolerance` is how far off a thin line (pen stroke or
 * arrow) still counts, so they stay easy to grab at any zoom.
 */
export function hitTest(shape: Hittable, p: Point, tolerance = 0): boolean {
  if (shape.type === 'arrow') {
    const { start, end } = arrowEnds(shape)
    return distanceToSegment(p, start, end) <= tolerance
  }

  if (shape.type === 'pen' && shape.points) {
    // The stroke is stored unscaled; map the point into its coordinates.
    const natural = pointsSize(shape.points)
    const sx = shape.w / Math.max(natural.w, 1)
    const sy = shape.h / Math.max(natural.h, 1)
    const local = { x: (p.x - shape.x) / sx, y: (p.y - shape.y) / sy }
    return distanceToPolyline(local, shape.points) <= tolerance / Math.min(sx, sy)
  }

  if (!rectContains(shape, p)) return false
  if (shape.type !== 'ellipse') return true
  const rx = shape.w / 2
  const ry = shape.h / 2
  if (rx === 0 || ry === 0) return false
  const dx = (p.x - (shape.x + rx)) / rx
  const dy = (p.y - (shape.y + ry)) / ry
  return dx * dx + dy * dy <= 1
}

/** `shapes` must be in draw order (bottom first); returns the topmost hit. */
export function topShapeAt<T extends Hittable>(
  shapes: readonly T[],
  p: Point,
  tolerance = 0,
): T | undefined {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i]!
    if (hitTest(shape, p, tolerance)) return shape
  }
  return undefined
}

export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

export type Handle = (typeof HANDLES)[number]

export function handlePoint(r: Rect, handle: Handle): Point {
  const x = handle.includes('w') ? r.x : handle.includes('e') ? r.x + r.w : r.x + r.w / 2
  const y = handle.includes('n') ? r.y : handle.includes('s') ? r.y + r.h : r.y + r.h / 2
  return { x, y }
}

/** Which resize handles a shape type offers. */
export function handlesFor(type: string): readonly Handle[] {
  // Arrows are edited by their two ends; text scales from its corners only.
  if (type === 'arrow') return []
  if (type === 'text') return ['nw', 'ne', 'se', 'sw']
  return HANDLES
}

export function handleAt(
  r: Rect,
  p: Point,
  tolerance: number,
  handles: readonly Handle[] = HANDLES,
): Handle | null {
  for (const handle of handles) {
    const h = handlePoint(r, handle)
    if (Math.abs(p.x - h.x) <= tolerance && Math.abs(p.y - h.y) <= tolerance) return handle
  }
  return null
}

export interface ResizeOptions {
  minSize?: number
  /** Corner handles only: keep the original width/height ratio. */
  keepAspect?: boolean
}

/**
 * Resize `original` by dragging `handle` by (dx, dy). The opposite edge or
 * corner stays fixed and the rect never shrinks below `minSize` or flips.
 */
export function resizeRect(
  original: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  { minSize = 8, keepAspect = false }: ResizeOptions = {},
): Rect {
  let left = original.x
  let top = original.y
  let right = original.x + original.w
  let bottom = original.y + original.h

  if (handle.includes('w')) left = Math.min(left + dx, right - minSize)
  if (handle.includes('e')) right = Math.max(right + dx, left + minSize)
  if (handle.includes('n')) top = Math.min(top + dy, bottom - minSize)
  if (handle.includes('s')) bottom = Math.max(bottom + dy, top + minSize)

  const isCorner = handle.length === 2
  if (keepAspect && isCorner && original.w > 0 && original.h > 0) {
    const scale = Math.max((right - left) / original.w, (bottom - top) / original.h)
    const w = original.w * scale
    const h = original.h * scale
    if (handle.includes('w')) left = right - w
    else right = left + w
    if (handle.includes('n')) top = bottom - h
    else bottom = top + h
  }

  return { x: left, y: top, w: right - left, h: bottom - top }
}

// ---- Lines: pen strokes and arrows ----

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  // Project p onto the segment, clamped to its ends.
  const t = lengthSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq
  const clamped = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + clamped * dx), p.y - (a.y + clamped * dy))
}

/** Distance from `p` to a polyline given as flat x, y pairs. */
export function distanceToPolyline(p: Point, points: readonly number[]): number {
  if (points.length < 2) return Infinity
  let best = Math.hypot(p.x - points[0]!, p.y - points[1]!)
  for (let i = 2; i + 1 < points.length; i += 2) {
    const a = { x: points[i - 2]!, y: points[i - 1]! }
    const b = { x: points[i]!, y: points[i + 1]! }
    best = Math.min(best, distanceToSegment(p, a, b))
  }
  return best
}

/** Width and height spanned by flat x, y pairs that start at the origin. */
export function pointsSize(points: readonly number[]): { w: number; h: number } {
  let w = 0
  let h = 0
  for (let i = 0; i + 1 < points.length; i += 2) {
    w = Math.max(w, points[i]!)
    h = Math.max(h, points[i + 1]!)
  }
  return { w, h }
}

/**
 * Ramer-Douglas-Peucker: drop points that lie within `tolerance` of the line
 * through their neighbours. A mouse stroke shrinks to a fraction of its raw
 * points with no visible change, which keeps the shared document small.
 */
export function simplifyPoints(points: readonly number[], tolerance: number): number[] {
  const count = points.length / 2
  if (count <= 2) return [...points]

  const keep = new Uint8Array(count)
  keep[0] = 1
  keep[count - 1] = 1
  const stack: [number, number][] = [[0, count - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    const a = { x: points[first * 2]!, y: points[first * 2 + 1]! }
    const b = { x: points[last * 2]!, y: points[last * 2 + 1]! }
    let worst = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment({ x: points[i * 2]!, y: points[i * 2 + 1]! }, a, b)
      if (d > worst) {
        worst = d
        index = i
      }
    }
    if (index !== -1 && worst > tolerance) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  const out: number[] = []
  for (let i = 0; i < count; i++) {
    if (keep[i]) out.push(points[i * 2]!, points[i * 2 + 1]!)
  }
  return out
}

interface ArrowBox extends Rect {
  flipX?: boolean
  flipY?: boolean
}

/** Where an arrow starts and where its head is. */
export function arrowEnds(arrow: ArrowBox): { start: Point; end: Point } {
  const left = arrow.x
  const right = arrow.x + arrow.w
  const top = arrow.y
  const bottom = arrow.y + arrow.h
  return {
    start: { x: arrow.flipX ? right : left, y: arrow.flipY ? bottom : top },
    end: { x: arrow.flipX ? left : right, y: arrow.flipY ? top : bottom },
  }
}

/** The bounding box and flips for an arrow from `start` to `end`. */
export function arrowFromEnds(start: Point, end: Point): Required<ArrowBox> {
  return { ...rectFromPoints(start, end), flipX: start.x > end.x, flipY: start.y > end.y }
}
