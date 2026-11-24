import * as Y from 'yjs'
import { arrowEnds, arrowFromEnds, boundaryPoint, rectCenter } from './geometry'
import { diffText } from './text'
import {
  COLORS,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  SHAPE_TYPES,
  TEXT_ALIGNS,
  hasText,
  isBoxType,
  type ColorName,
  type Shape,
  type ShapeType,
  type TextAlign,
} from './types'

export type ShapePatch = Partial<Omit<Shape, 'id' | 'type' | 'points' | 'startId' | 'endId'>> & {
  /** `null` detaches that end of an arrow. */
  startId?: string | null
  endId?: string | null
}

/** Space left between an attached arrow end and the shape it touches. */
const ARROW_GAP = 6

/**
 * Give an arrow its real geometry. An attached end sits on the outline of
 * its shape, on the line toward the arrow's other end; a free end is where
 * it was stored. Because this is computed on read, moving a shape moves its
 * arrows on every client with no extra edits to send or to conflict.
 */
export function resolveArrow(arrow: Shape, byId: ReadonlyMap<string, Shape>): Shape {
  const attached = (id: string | undefined) => {
    const target = id ? byId.get(id) : undefined
    return target && target.type !== 'arrow' ? target : undefined
  }
  const startTarget = attached(arrow.startId)
  const endTarget = attached(arrow.endId)
  if (!startTarget && !endTarget) return arrow

  const stored = arrowEnds(arrow)
  const startAim = startTarget ? rectCenter(startTarget) : stored.start
  const endAim = endTarget ? rectCenter(endTarget) : stored.end
  const start = startTarget ? boundaryPoint(startTarget, endAim, ARROW_GAP) : stored.start
  const end = endTarget ? boundaryPoint(endTarget, startAim, ARROW_GAP) : stored.end
  return { ...arrow, ...arrowFromEnds(start, end) }
}

const MAX_TEXT_LENGTH = 5000
export const MAX_TITLE_LENGTH = 80
/** Edits closer together than this merge into one undo step. */
const UNDO_MERGE_MS = 600

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Read a shape out of the shared document. The document can be written by
 * anyone with the board link, so anything malformed is dropped, not trusted.
 */
export function parseShape(id: string, map: Y.Map<unknown>): Shape | null {
  const type = map.get('type')
  const color = map.get('color')
  const text = map.get('text')
  const x = map.get('x')
  const y = map.get('y')
  const w = map.get('w')
  const h = map.get('h')
  const z = map.get('z')

  if (!SHAPE_TYPES.includes(type as ShapeType)) return null
  if (!COLORS.includes(color as ColorName)) return null
  if (!isNumber(x) || !isNumber(y) || !isNumber(w) || !isNumber(h) || !isNumber(z)) return null
  if (w < 0 || h < 0) return null

  const shape: Shape = {
    id,
    type: type as ShapeType,
    color: color as ColorName,
    text: readText(text).slice(0, MAX_TEXT_LENGTH),
    x,
    y,
    w,
    h,
    z,
  }

  if (shape.type === 'pen') {
    const points = decodePoints(map.get('points'))
    if (!points) return null
    shape.points = points
  }
  if (shape.type === 'arrow') {
    shape.flipX = map.get('flipX') === true
    shape.flipY = map.get('flipY') === true
    const startId = map.get('startId')
    const endId = map.get('endId')
    if (typeof startId === 'string') shape.startId = startId
    if (typeof endId === 'string') shape.endId = endId
  }
  if (hasText(shape.type)) readFormat(shape, map)
  return shape
}

/** A shape's text formatting. Unknown values are ignored: the default is used instead. */
function readFormat(shape: Shape, map: Y.Map<unknown>): void {
  const fontSize = map.get('fontSize')
  const align = map.get('align')
  if (
    isBoxType(shape.type) &&
    isNumber(fontSize) &&
    fontSize >= MIN_FONT_SIZE &&
    fontSize <= MAX_FONT_SIZE
  ) {
    shape.fontSize = fontSize
  }
  if (TEXT_ALIGNS.includes(align as TextAlign)) shape.align = align as TextAlign
  if (map.get('bold') === true) shape.bold = true
  if (map.get('italic') === true) shape.italic = true
  if (map.get('strike') === true) shape.strike = true
}

/**
 * A shape's text is a Y.Text, so two people typing in the same note are
 * merged character by character. (Boards saved before that hold a plain
 * string, which is still read, and upgraded on the next edit.)
 */
function readText(value: unknown): string {
  if (value instanceof Y.Text) return value.toString()
  return typeof value === 'string' ? value : ''
}

// Pen points are stored as integers in tenths of a unit: integers encode in
// 1-3 bytes each, where fractional numbers would take 9.
const POINT_SCALE = 10
const MAX_POINT_VALUES = 20_000

export const encodePoints = (points: readonly number[]): number[] =>
  points.map((v) => Math.round(v * POINT_SCALE))

/** Decoded once per stored array, so shapes keep a stable `points` identity. */
const decodedPoints = new WeakMap<object, readonly number[]>()

function decodePoints(raw: unknown): readonly number[] | null {
  if (!Array.isArray(raw)) return null
  const cached = decodedPoints.get(raw)
  if (cached) return cached
  if (raw.length < 4 || raw.length % 2 !== 0 || raw.length > MAX_POINT_VALUES) return null
  if (!raw.every(isNumber)) return null
  const points = raw.map((v) => v / POINT_SCALE)
  decodedPoints.set(raw, points)
  return points
}

/**
 * The board's data, held in a Yjs document.
 *
 * Every shape is its own Y.Map inside the top-level `shapes` map, so edits to
 * different properties of one shape (one person moves it, another recolours
 * it) merge instead of overwriting each other.
 */
/** `shapes` with every attached arrow given its real geometry. */
export function resolveShapes(shapes: readonly Shape[]): Shape[] {
  const byId = new Map(shapes.map((s) => [s.id, s]))
  return shapes.map((s) => (s.type === 'arrow' ? resolveArrow(s, byId) : s))
}

export class BoardStore {
  readonly doc: Y.Doc
  /** Transaction origin for local edits, used to scope undo to this user. */
  readonly origin = { source: 'local' }

  /**
   * View-only boards never change the document locally. (The server also
   * refuses writes from viewers; this keeps the local copy honest too.)
   * Set by the editor, from what the server says this connection may do.
   */
  readOnly: boolean

  private readonly shapes: Y.Map<Y.Map<unknown>>
  private readonly meta: Y.Map<unknown>
  private readonly history: Y.UndoManager
  private readonly listeners = new Set<() => void>()
  private sorted: Shape[] | null = null
  private historyAvailability = 'false,false'
  private byId = new Map<string, Shape>()

  constructor(doc: Y.Doc = new Y.Doc(), options: { readOnly?: boolean } = {}) {
    this.doc = doc
    this.readOnly = options.readOnly ?? false
    this.shapes = doc.getMap('shapes')
    this.shapes.observeDeep(this.handleChange)
    this.meta = doc.getMap('meta')
    this.meta.observe(this.handleChange)

    // Only transactions with our origin are tracked, so undo reverts this
    // person's edits and leaves everyone else's alone.
    this.history = new Y.UndoManager(this.shapes, {
      trackedOrigins: new Set([this.origin]),
      captureTimeout: UNDO_MERGE_MS,
    })
    this.history.on('stack-item-added', this.handleHistoryChange)
    this.history.on('stack-item-popped', this.handleHistoryChange)
  }

  private handleChange = () => {
    this.sorted = null
    for (const listener of this.listeners) listener()
  }

  /**
   * The undo stack is updated just after the document's own change event, so
   * tell listeners again if that changed whether undo or redo is possible.
   */
  private handleHistoryChange = () => {
    const availability = `${this.canUndo()},${this.canRedo()}`
    if (availability === this.historyAvailability) return
    this.historyAvailability = availability
    for (const listener of this.listeners) listener()
  }

  /** All valid shapes in draw order (bottom first). */
  list(): readonly Shape[] {
    if (!this.sorted) {
      const shapes: Shape[] = []
      this.shapes.forEach((map, id) => {
        const shape = parseShape(id, map)
        if (shape) shapes.push(shape)
      })
      shapes.sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1))
      // Attached arrows take their position from the shapes they point at.
      this.sorted = resolveShapes(shapes)
      this.byId = new Map(this.sorted.map((s) => [s.id, s]))
    }
    return this.sorted
  }

  get(id: string): Shape | undefined {
    this.list()
    return this.byId.get(id)
  }

  /** A `z` above every existing shape. */
  topZ(): number {
    const shapes = this.list()
    return (shapes[shapes.length - 1]?.z ?? 0) + 1
  }

  /** A `z` below every existing shape. */
  bottomZ(): number {
    return (this.list()[0]?.z ?? 0) - 1
  }

  add(shape: Shape): void {
    this.transact(() => {
      const map = new Y.Map<unknown>()
      for (const [key, value] of Object.entries(shape)) {
        if (key === 'id' || value === undefined) continue
        if (key === 'points') map.set(key, encodePoints(value as number[]))
        else if (key === 'text') map.set(key, new Y.Text(String(value).slice(0, MAX_TEXT_LENGTH)))
        else map.set(key, value)
      }
      this.shapes.set(shape.id, map)
    })
  }

  update(id: string, patch: ShapePatch): void {
    this.transact(() => {
      const map = this.shapes.get(id)
      if (!map) return
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue
        if (value === null) {
          if (map.has(key)) map.delete(key)
          continue
        }
        if (key === 'text') this.editText(map, String(value).slice(0, MAX_TEXT_LENGTH))
        else if (map.get(key) !== value) map.set(key, value)
      }
    })
  }

  /**
   * Change a shape's text by applying only what differs. Replacing the whole
   * value would discard whatever someone else typed at the same moment.
   */
  private editText(map: Y.Map<unknown>, text: string): void {
    const current = map.get('text')
    if (!(current instanceof Y.Text)) {
      map.set('text', new Y.Text(text))
      return
    }
    const edit = diffText(current.toString(), text)
    if (!edit) return
    if (edit.remove > 0) current.delete(edit.index, edit.remove)
    if (edit.insert) current.insert(edit.index, edit.insert)
  }

  remove(ids: readonly string[]): void {
    this.transact(() => {
      for (const id of ids) this.shapes.delete(id)
    })
  }

  /** Group several edits into one atomic change (and one undo step). */
  transact(fn: () => void): void {
    if (this.readOnly) return
    this.doc.transact(fn, this.origin)
  }

  // ---- Board title ----

  getTitle(): string {
    const title = this.meta.get('title')
    return typeof title === 'string' ? title.slice(0, MAX_TITLE_LENGTH) : ''
  }

  setTitle(title: string): void {
    this.transact(() => this.meta.set('title', title.slice(0, MAX_TITLE_LENGTH)))
  }

  // ---- Undo ----

  undo(): void {
    this.history.undo()
  }

  redo(): void {
    this.history.redo()
  }

  canUndo(): boolean {
    return this.history.canUndo()
  }

  canRedo(): boolean {
    return this.history.canRedo()
  }

  /** Forget all undo and redo steps (for content the user did not make). */
  clearHistory(): void {
    this.history.clear()
    this.handleHistoryChange()
  }

  /**
   * End the current undo step. Edits made in quick succession are merged
   * into one step (a drag is hundreds of tiny moves); call this at the
   * boundary of each gesture so separate actions undo separately.
   */
  commit(): void {
    this.history.stopCapturing()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    this.shapes.unobserveDeep(this.handleChange)
    this.meta.unobserve(this.handleChange)
    this.history.destroy()
    this.listeners.clear()
  }
}
