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

export function hitTest(shape: Rect & { type: string }, p: Point): boolean {
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
export function topShapeAt<T extends Rect & { type: string }>(
  shapes: readonly T[],
  p: Point,
): T | undefined {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i]!
    if (hitTest(shape, p)) return shape
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

export function handleAt(r: Rect, p: Point, tolerance: number): Handle | null {
  for (const handle of HANDLES) {
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
