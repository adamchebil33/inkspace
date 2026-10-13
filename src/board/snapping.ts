import type { Handle, Point, Rect } from './geometry'

// Smart guides: while something is moved, resized or drawn out, its edges and
// centre snap to the edges and centres of shapes around it, and a guide line
// shows what it lined up with. All pure functions on rectangles.

/** A guide line. `axis: 'x'` is a vertical line at x = `at`, from y = `from` to `to`. */
export interface Guide {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
}

type Axis = 'x' | 'y'

/** Left, centre and right (or top, middle and bottom) of a rectangle. */
const lines = (r: Rect, axis: Axis): number[] =>
  axis === 'x' ? [r.x, r.x + r.w / 2, r.x + r.w] : [r.y, r.y + r.h / 2, r.y + r.h]

/** Within this distance two lines count as aligned (floating point slack). */
const ALIGNED = 0.01

/**
 * The smallest correction that puts one of the `moving` values exactly on a
 * line of one of the targets, if any is within `threshold`; otherwise 0.
 */
function nearestOffset(
  moving: readonly number[],
  targets: readonly Rect[],
  axis: Axis,
  threshold: number,
): number {
  let best = Infinity
  for (const target of targets) {
    for (const line of lines(target, axis)) {
      for (const value of moving) {
        const offset = line - value
        if (Math.abs(offset) <= threshold && Math.abs(offset) < Math.abs(best)) best = offset
      }
    }
  }
  return best === Infinity ? 0 : best
}

/**
 * Guide lines for every target line that one of the `moving` values sits on,
 * each spanning from `box` to the target. Lines at the same place are merged.
 */
function guidesFor(
  box: Rect,
  moving: readonly number[],
  targets: readonly Rect[],
  axis: Axis,
): Guide[] {
  const guides: Guide[] = []
  const across: Axis = axis === 'x' ? 'y' : 'x'
  const start = (r: Rect) => (across === 'y' ? r.y : r.x)
  const end = (r: Rect) => (across === 'y' ? r.y + r.h : r.x + r.w)

  for (const target of targets) {
    for (const line of lines(target, axis)) {
      if (!moving.some((value) => Math.abs(value - line) < ALIGNED)) continue
      const from = Math.min(start(box), start(target))
      const to = Math.max(end(box), end(target))
      const same = guides.find((g) => Math.abs(g.at - line) < ALIGNED)
      if (same) {
        same.from = Math.min(same.from, from)
        same.to = Math.max(same.to, to)
      } else {
        guides.push({ axis, at: line, from, to })
      }
    }
  }
  return guides
}

export interface MoveSnap {
  dx: number
  dy: number
  guides: Guide[]
}

/** Snap a box being moved: any of its edges or its centre, on each axis. */
export function snapMove(box: Rect, targets: readonly Rect[], threshold: number): MoveSnap {
  const dx = nearestOffset(lines(box, 'x'), targets, 'x', threshold)
  const dy = nearestOffset(lines(box, 'y'), targets, 'y', threshold)
  const moved = { ...box, x: box.x + dx, y: box.y + dy }
  return {
    dx,
    dy,
    guides: [
      ...guidesFor(moved, lines(moved, 'x'), targets, 'x'),
      ...guidesFor(moved, lines(moved, 'y'), targets, 'y'),
    ],
  }
}

/**
 * Snap a box being resized from `handle`. Only the edges being dragged move,
 * so only they snap; the opposite edges stay where they are. A snap that
 * would make the box smaller than `minSize` is skipped.
 */
export function snapResize(
  rect: Rect,
  handle: Handle,
  targets: readonly Rect[],
  threshold: number,
  minSize = 0,
): { rect: Rect; guides: Guide[] } {
  let { x, y, w, h } = rect
  const movingX: number[] = []
  const movingY: number[] = []

  if (handle.includes('w') || handle.includes('e')) {
    const left = handle.includes('w')
    const edge = left ? x : x + w
    const offset = nearestOffset([edge], targets, 'x', threshold)
    const width = left ? w - offset : w + offset
    if (width >= minSize) {
      if (left) x += offset
      w = width
    }
    movingX.push(left ? x : x + w)
  }
  if (handle.includes('n') || handle.includes('s')) {
    const top = handle.includes('n')
    const edge = top ? y : y + h
    const offset = nearestOffset([edge], targets, 'y', threshold)
    const height = top ? h - offset : h + offset
    if (height >= minSize) {
      if (top) y += offset
      h = height
    }
    movingY.push(top ? y : y + h)
  }

  const snapped = { x, y, w, h }
  return {
    rect: snapped,
    guides: [
      ...guidesFor(snapped, movingX, targets, 'x'),
      ...guidesFor(snapped, movingY, targets, 'y'),
    ],
  }
}

/** Snap a single point (the corner being dragged out when creating a shape). */
export function snapPoint(
  point: Point,
  targets: readonly Rect[],
  threshold: number,
): { point: Point; guides: Guide[] } {
  const snapped = {
    x: point.x + nearestOffset([point.x], targets, 'x', threshold),
    y: point.y + nearestOffset([point.y], targets, 'y', threshold),
  }
  const box = { ...snapped, w: 0, h: 0 }
  return {
    point: snapped,
    guides: [
      ...guidesFor(box, [snapped.x], targets, 'x'),
      ...guidesFor(box, [snapped.y], targets, 'y'),
    ],
  }
}
