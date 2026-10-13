import {
  arrowEnds,
  handlePoint,
  handlesFor,
  pointsSize,
  rectsIntersect,
  worldToScreen,
  type Camera,
  type Point,
  type Rect,
} from './geometry'
import type { Draft, Peer } from './presence'
import type { Guide } from './snapping'
import { FONT, FONT_FAMILY, FONT_SIZE, LINE_HEIGHT, textScale, textWidth, wrapText } from './text'
import { PALETTE, SHAPE_TEXT_COLOR, inkColor, type Theme } from './theme'
import type { Shape } from './types'

export interface RenderState {
  shapes: readonly Shape[]
  camera: Camera
  selection: readonly string[]
  marquee: Rect | null
  /** Shape whose text is being edited in the HTML overlay (not drawn here). */
  editingId: string | null
  /** The pen stroke being drawn locally. */
  draft: Draft | null
  /** Other people on the board: their cursors and what they have selected. */
  peers: readonly Peer[]
  /** Shape an arrow end would attach to if released now. */
  attachTargetId?: string | null
  /** Alignment guides shown while snapping. */
  guides?: readonly Guide[]
  /** Leave out the dot grid (image export). */
  hideGrid?: boolean
}

export interface Viewport {
  width: number
  height: number
  dpr: number
}

const GRID_STEP = 24
const MIN_GRID_SCREEN_STEP = 16
export const HANDLE_SIZE = 8
export const PEN_WIDTH = 3.5
export const ARROW_WIDTH = 2.5
const ARROW_HEAD = 14

export function render(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  state: RenderState,
  theme: Theme,
): void {
  const { camera } = state
  const { zoom } = camera
  const { dpr } = view

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, view.width, view.height)
  if (!state.hideGrid) drawGrid(ctx, view, camera, theme)

  // From here on, draw in world coordinates.
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camera.x * zoom * dpr, -camera.y * zoom * dpr)

  // Skip anything off screen. The margin covers line width and shadows.
  const margin = 20
  const visible: Rect = {
    x: camera.x - margin,
    y: camera.y - margin,
    w: view.width / zoom + margin * 2,
    h: view.height / zoom + margin * 2,
  }
  for (const shape of state.shapes) {
    if (!rectsIntersect(shape, visible)) continue
    drawShape(ctx, shape, theme, zoom * dpr, shape.id === state.editingId)
  }

  // Strokes still being drawn, ours and other people's.
  for (const peer of state.peers) {
    if (peer.draft) drawStroke(ctx, strokePath(peer.draft.points), peer.draft, theme)
  }
  if (state.draft) drawStroke(ctx, strokePath(state.draft.points), state.draft, theme)

  drawPeerSelections(ctx, state)

  // While an arrow end is dragged over a shape, show what it will attach to.
  const target = state.attachTargetId && state.shapes.find((s) => s.id === state.attachTargetId)
  if (target) {
    ctx.strokeStyle = theme.accent
    ctx.lineWidth = 2.5 / zoom
    const pad = 4 / zoom
    ctx.beginPath()
    ctx.roundRect(target.x - pad, target.y - pad, target.w + pad * 2, target.h + pad * 2, 6 / zoom)
    ctx.stroke()
  }
  drawSelection(ctx, state, theme)

  if (state.guides?.length) {
    ctx.strokeStyle = theme.guide
    ctx.lineWidth = 1 / zoom
    ctx.beginPath()
    for (const guide of state.guides) {
      if (guide.axis === 'x') {
        ctx.moveTo(guide.at, guide.from)
        ctx.lineTo(guide.at, guide.to)
      } else {
        ctx.moveTo(guide.from, guide.at)
        ctx.lineTo(guide.to, guide.at)
      }
    }
    ctx.stroke()
  }

  if (state.marquee) {
    const m = state.marquee
    ctx.fillStyle = theme.marqueeFill
    ctx.fillRect(m.x, m.y, m.w, m.h)
    ctx.strokeStyle = theme.accent
    ctx.lineWidth = 1 / zoom
    ctx.strokeRect(m.x, m.y, m.w, m.h)
  }

  // Cursors stay the same size at any zoom, so draw them in screen pixels.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  for (const peer of state.peers) {
    if (peer.cursor) drawCursor(ctx, worldToScreen(camera, peer.cursor), peer)
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, view: Viewport, camera: Camera, theme: Theme) {
  // Double the spacing as you zoom out so the dots never get too dense.
  let step = GRID_STEP
  while (step * camera.zoom < MIN_GRID_SCREEN_STEP) step *= 2

  ctx.fillStyle = theme.gridDot
  const startX = Math.floor(camera.x / step) * step
  const startY = Math.floor(camera.y / step) * step
  const endX = camera.x + view.width / camera.zoom
  const endY = camera.y + view.height / camera.zoom
  for (let x = startX; x <= endX; x += step) {
    const sx = (x - camera.x) * camera.zoom
    for (let y = startY; y <= endY; y += step) {
      ctx.fillRect(sx - 1, (y - camera.y) * camera.zoom - 1, 2, 2)
    }
  }
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  theme: Theme,
  deviceScale: number,
  editing: boolean,
) {
  switch (shape.type) {
    case 'pen':
      drawPen(ctx, shape, theme)
      break
    case 'arrow':
      drawArrow(ctx, shape, theme)
      break
    case 'text':
      if (!editing) drawFreeText(ctx, shape, theme)
      break
    default:
      drawBox(ctx, shape, deviceScale)
      if (shape.text && !editing) drawBoxText(ctx, shape)
  }
}

// ---- Boxes: sticky notes, rectangles, ellipses ----

function drawBox(ctx: CanvasRenderingContext2D, shape: Shape, deviceScale: number) {
  const { fill, stroke } = PALETTE[shape.color]
  ctx.fillStyle = fill

  if (shape.type === 'sticky') {
    // Shadow sizes are in device pixels, so scale them with the zoom.
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
    ctx.shadowBlur = 10 * deviceScale
    ctx.shadowOffsetY = 3 * deviceScale
    ctx.beginPath()
    ctx.roundRect(shape.x, shape.y, shape.w, shape.h, 3)
    ctx.fill()
    ctx.restore()
    return
  }

  ctx.beginPath()
  if (shape.type === 'ellipse') {
    ctx.ellipse(
      shape.x + shape.w / 2,
      shape.y + shape.h / 2,
      shape.w / 2,
      shape.h / 2,
      0,
      0,
      Math.PI * 2,
    )
  } else {
    ctx.roundRect(shape.x, shape.y, shape.w, shape.h, Math.min(8, shape.w / 2, shape.h / 2))
  }
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawBoxText(ctx: CanvasRenderingContext2D, shape: Shape) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(shape.x, shape.y, shape.w, shape.h)
  ctx.clip()

  ctx.font = FONT
  ctx.fillStyle = SHAPE_TEXT_COLOR
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const lines = wrapText(shape.text, textWidth(shape), (s) => ctx.measureText(s).width)
  const centerX = shape.x + shape.w / 2
  let y = shape.y + shape.h / 2 - ((lines.length - 1) * LINE_HEIGHT) / 2
  for (const line of lines) {
    ctx.fillText(line, centerX, y)
    y += LINE_HEIGHT
  }
  ctx.restore()
}

// ---- Free text ----

function drawFreeText(ctx: CanvasRenderingContext2D, shape: Shape, theme: Theme) {
  const scale = textScale(shape)
  ctx.font = `${FONT_SIZE * scale}px ${FONT_FAMILY}`
  ctx.fillStyle = inkColor(shape.color, theme)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const lineHeight = LINE_HEIGHT * scale
  shape.text.split('\n').forEach((line, i) => {
    ctx.fillText(line, shape.x, shape.y + (i + 0.5) * lineHeight)
  })
}

// ---- Pen strokes ----

/** Finished strokes never change, so each one's path is built only once. */
const pathCache = new WeakMap<readonly number[], Path2D>()

/** A smooth curve through the points: quadratic segments between midpoints. */
function strokePath(points: readonly number[]): Path2D {
  const path = new Path2D()
  path.moveTo(points[0]!, points[1]!)
  if (points.length === 2) {
    // A single point: a zero-length line still draws a round dot.
    path.lineTo(points[0]!, points[1]!)
    return path
  }
  for (let i = 2; i + 3 < points.length; i += 2) {
    const midX = (points[i]! + points[i + 2]!) / 2
    const midY = (points[i + 1]! + points[i + 3]!) / 2
    path.quadraticCurveTo(points[i]!, points[i + 1]!, midX, midY)
  }
  path.lineTo(points[points.length - 2]!, points[points.length - 1]!)
  return path
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  { color }: Pick<Shape, 'color'>,
  theme: Theme,
) {
  ctx.strokeStyle = inkColor(color, theme)
  ctx.lineWidth = PEN_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(path)
}

function drawPen(ctx: CanvasRenderingContext2D, shape: Shape, theme: Theme) {
  if (!shape.points) return
  let base = pathCache.get(shape.points)
  if (!base) {
    base = strokePath(shape.points)
    pathCache.set(shape.points, base)
  }

  // Place (and, if the box was resized, stretch) the stored path. Transforming
  // the path rather than the context keeps the line width even.
  const natural = pointsSize(shape.points)
  const placed = new Path2D()
  placed.addPath(base, {
    a: shape.w / Math.max(natural.w, 1),
    d: shape.h / Math.max(natural.h, 1),
    e: shape.x,
    f: shape.y,
  })
  drawStroke(ctx, placed, shape, theme)
}

// ---- Arrows ----

function drawArrow(ctx: CanvasRenderingContext2D, shape: Shape, theme: Theme) {
  const { start, end } = arrowEnds(shape)
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const head = Math.min(ARROW_HEAD, length / 2)

  ctx.strokeStyle = inkColor(shape.color, theme)
  ctx.lineWidth = ARROW_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  for (const side of [-1, 1]) {
    const wing = angle + Math.PI + side * 0.45
    ctx.moveTo(end.x, end.y)
    ctx.lineTo(end.x + Math.cos(wing) * head, end.y + Math.sin(wing) * head)
  }
  ctx.stroke()
}

// ---- Selection, presence ----

function drawSelection(ctx: CanvasRenderingContext2D, state: RenderState, theme: Theme) {
  if (state.selection.length === 0) return
  const { zoom } = state.camera
  const selected = new Set(state.selection)
  const single = selected.size === 1
  const size = HANDLE_SIZE / zoom

  ctx.strokeStyle = theme.accent
  ctx.fillStyle = theme.handleFill
  ctx.lineWidth = 1.5 / zoom

  for (const shape of state.shapes) {
    if (!selected.has(shape.id)) continue

    if (shape.type === 'arrow') {
      // An arrow's bounding box says little; mark its two ends instead.
      const { start, end } = arrowEnds(shape)
      for (const p of [start, end]) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, size * 0.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      continue
    }

    ctx.strokeRect(shape.x, shape.y, shape.w, shape.h)
    if (!single) continue
    for (const handle of handlesFor(shape.type)) {
      const p = handlePoint(shape, handle)
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size)
      ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size)
    }
  }
}

/** Outline what each other person has selected, in their colour. */
function drawPeerSelections(ctx: CanvasRenderingContext2D, state: RenderState) {
  const colorById = new Map<string, string>()
  for (const peer of state.peers) {
    for (const id of peer.selection) colorById.set(id, peer.color)
  }
  if (colorById.size === 0) return

  ctx.lineWidth = 2 / state.camera.zoom
  for (const shape of state.shapes) {
    const color = colorById.get(shape.id)
    if (!color) continue
    ctx.strokeStyle = color
    ctx.strokeRect(shape.x, shape.y, shape.w, shape.h)
  }
}

function drawCursor(ctx: CanvasRenderingContext2D, at: Point, peer: Peer) {
  // Arrow with its tip exactly on the pointer position.
  ctx.beginPath()
  ctx.moveTo(at.x, at.y)
  ctx.lineTo(at.x, at.y + 17)
  ctx.lineTo(at.x + 4.6, at.y + 12.6)
  ctx.lineTo(at.x + 11.5, at.y + 12.6)
  ctx.closePath()
  ctx.fillStyle = peer.color
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.stroke()

  // Name tag.
  ctx.font = `500 12px ${FONT_FAMILY}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const width = ctx.measureText(peer.name).width + 12
  ctx.beginPath()
  ctx.roundRect(at.x + 12, at.y + 16, width, 20, 6)
  ctx.fillStyle = peer.color
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillText(peer.name, at.x + 18, at.y + 26.5)
}
