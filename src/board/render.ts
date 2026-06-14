import {
  HANDLES,
  handlePoint,
  rectsIntersect,
  worldToScreen,
  type Camera,
  type Point,
  type Rect,
} from './geometry'
import type { Peer } from './presence'
import { FONT, FONT_FAMILY, LINE_HEIGHT, textWidth, wrapText } from './text'
import { PALETTE, SHAPE_TEXT_COLOR, type Theme } from './theme'
import type { Shape } from './types'

export interface RenderState {
  shapes: readonly Shape[]
  camera: Camera
  selection: readonly string[]
  marquee: Rect | null
  /** Shape whose text is being edited in the HTML overlay (not drawn here). */
  editingId: string | null
  /** Other people on the board: their cursors and what they have selected. */
  peers: readonly Peer[]
}

export interface Viewport {
  width: number
  height: number
  dpr: number
}

const GRID_STEP = 24
const MIN_GRID_SCREEN_STEP = 16
export const HANDLE_SIZE = 8

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
  drawGrid(ctx, view, camera, theme)

  // From here on, draw in world coordinates.
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camera.x * zoom * dpr, -camera.y * zoom * dpr)

  const visible: Rect = {
    x: camera.x,
    y: camera.y,
    w: view.width / zoom,
    h: view.height / zoom,
  }
  for (const shape of state.shapes) {
    if (!rectsIntersect(shape, visible)) continue
    drawShape(ctx, shape, zoom * dpr)
    if (shape.text && shape.id !== state.editingId) drawText(ctx, shape)
  }

  drawPeerSelections(ctx, state)
  drawSelection(ctx, state, theme)

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

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, deviceScale: number) {
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

function drawText(ctx: CanvasRenderingContext2D, shape: Shape) {
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

function drawSelection(ctx: CanvasRenderingContext2D, state: RenderState, theme: Theme) {
  if (state.selection.length === 0) return
  const { zoom } = state.camera
  const selected = new Set(state.selection)

  ctx.strokeStyle = theme.accent
  ctx.lineWidth = 1.5 / zoom
  let single: Shape | undefined
  for (const shape of state.shapes) {
    if (!selected.has(shape.id)) continue
    ctx.strokeRect(shape.x, shape.y, shape.w, shape.h)
    single = shape
  }

  // Resize handles only for a single selection.
  if (selected.size !== 1 || !single) return
  const size = HANDLE_SIZE / zoom
  ctx.fillStyle = theme.handleFill
  for (const handle of HANDLES) {
    const p = handlePoint(single, handle)
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size)
    ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size)
  }
}
