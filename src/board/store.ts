import * as Y from 'yjs'
import { COLORS, SHAPE_TYPES, type ColorName, type Shape, type ShapeType } from './types'

export type ShapePatch = Partial<Omit<Shape, 'id' | 'type' | 'points'>>

const MAX_TEXT_LENGTH = 5000
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
    text: typeof text === 'string' ? text.slice(0, MAX_TEXT_LENGTH) : '',
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
  }
  return shape
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
export class BoardStore {
  readonly doc: Y.Doc
  /** Transaction origin for local edits, used to scope undo to this user. */
  readonly origin = { source: 'local' }

  private readonly shapes: Y.Map<Y.Map<unknown>>
  private readonly history: Y.UndoManager
  private readonly listeners = new Set<() => void>()
  private sorted: Shape[] | null = null
  private historyAvailability = 'false,false'
  private byId = new Map<string, Shape>()

  constructor(doc: Y.Doc = new Y.Doc()) {
    this.doc = doc
    this.shapes = doc.getMap('shapes')
    this.shapes.observeDeep(this.handleChange)

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
      this.sorted = shapes
      this.byId = new Map(shapes.map((s) => [s.id, s]))
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
        map.set(key, key === 'points' ? encodePoints(value as number[]) : value)
      }
      this.shapes.set(shape.id, map)
    })
  }

  update(id: string, patch: ShapePatch): void {
    this.transact(() => {
      const map = this.shapes.get(id)
      if (!map) return
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined && map.get(key) !== value) map.set(key, value)
      }
    })
  }

  remove(ids: readonly string[]): void {
    this.transact(() => {
      for (const id of ids) this.shapes.delete(id)
    })
  }

  /** Group several edits into one atomic change (and one undo step). */
  transact(fn: () => void): void {
    this.doc.transact(fn, this.origin)
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
    this.history.destroy()
    this.listeners.clear()
  }
}
