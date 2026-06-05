import * as Y from 'yjs'
import { COLORS, SHAPE_TYPES, type ColorName, type Shape, type ShapeType } from './types'

export type ShapePatch = Partial<Omit<Shape, 'id' | 'type'>>

const MAX_TEXT_LENGTH = 5000

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

  return {
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
  private readonly listeners = new Set<() => void>()
  private sorted: Shape[] | null = null
  private byId = new Map<string, Shape>()

  constructor(doc: Y.Doc = new Y.Doc()) {
    this.doc = doc
    this.shapes = doc.getMap('shapes')
    this.shapes.observeDeep(this.handleChange)
  }

  private handleChange = () => {
    this.sorted = null
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
        if (key !== 'id') map.set(key, value)
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

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    this.shapes.unobserveDeep(this.handleChange)
    this.listeners.clear()
  }
}
