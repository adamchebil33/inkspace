import {
  arrowEnds,
  arrowFromEnds,
  clampZoom,
  handleAt,
  handlesFor,
  pointsSize,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  screenToWorld,
  simplifyPoints,
  topShapeAt,
  zoomAt,
  type Camera,
  type Handle,
  type Point,
  type Rect,
} from './geometry'
import type { Draft } from './presence'
import { HANDLE_SIZE, type RenderState } from './render'
import type { BoardStore } from './store'
import { FONT_SIZE, LINE_HEIGHT, textBlockSize, textScale } from './text'
import {
  isBoxType,
  type BoxType,
  type ColorName,
  type Shape,
  type ShapeType,
  type Tool,
} from './types'

/** A pointer event reduced to what the editor needs; x/y are canvas pixels. */
export interface PointerInput {
  x: number
  y: number
  button: number
  shift: boolean
}

export interface WheelInput {
  x: number
  y: number
  deltaX: number
  deltaY: number
  /** Ctrl/Cmd held, or a trackpad pinch (browsers report it as ctrl+wheel). */
  zoom: boolean
}

/**
 * Boxes are coloured by their fill; pen, arrows and text by their line.
 * Each family remembers its own colour, so picking a red pen does not turn
 * the next sticky note red.
 */
export type ColorFamily = 'fill' | 'ink'

/** Everything the React UI renders from. Replaced, never mutated. */
export interface EditorState {
  tool: Tool
  selection: readonly string[]
  camera: Camera
  editingId: string | null
  /** Colour the next shape drawn with the current tool will get. */
  color: ColorName
  colorFamily: ColorFamily
  canUndo: boolean
  canRedo: boolean
  /** Bumps on every document change so the UI re-reads shapes. */
  docVersion: number
}

export interface EditorOptions {
  /** Width of a string at the base font size. Injected so tests need no DOM. */
  measureText?: (text: string) => number
}

type Interaction =
  | { kind: 'idle' }
  | { kind: 'pan'; startScreen: Point; startCamera: Camera }
  | {
      kind: 'move'
      startScreen: Point
      startWorld: Point
      originals: Map<string, Point>
      dragged: boolean
      /** Plain click on an already-selected shape narrows the selection to it. */
      collapseTo: string | null
    }
  | { kind: 'resize'; id: string; handle: Handle; startWorld: Point; original: Rect }
  /** Dragging one end of an arrow while the other stays put. */
  | { kind: 'endpoint'; id: string; fixed: Point; moving: 'start' | 'end'; creating: boolean }
  | { kind: 'marquee'; startWorld: Point; currentWorld: Point; base: readonly string[] }
  | { kind: 'create'; type: ShapeType; startScreen: Point; startWorld: Point; id: string | null }
  /** Pen stroke in progress: flat x, y pairs in world coordinates. */
  | { kind: 'draw'; points: number[] }

/** What the pointer would grab on the single selected shape. */
type Grab = { kind: 'resize'; handle: Handle } | { kind: 'endpoint'; moving: 'start' | 'end' }

const DRAG_THRESHOLD = 3
const MIN_SHAPE_SIZE = 8
const DUPLICATE_OFFSET = 20
/** Screen pixels within which a thin line still counts as hit. */
const LINE_HIT_TOLERANCE = 7
const DEFAULT_ARROW_LENGTH = 160

const DEFAULT_SIZE: Record<BoxType, { w: number; h: number }> = {
  sticky: { w: 200, h: 200 },
  rect: { w: 180, h: 110 },
  ellipse: { w: 150, h: 150 },
}

const RESIZE_CURSOR: Record<Handle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
}

const newId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 16)

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

const familyOf = (type: ShapeType): ColorFamily => (isBoxType(type) ? 'fill' : 'ink')

const isShapeTool = (tool: Tool): tool is ShapeType => tool !== 'select' && tool !== 'hand'

/**
 * The whiteboard's interaction logic: tools, selection, camera and gestures.
 *
 * It knows nothing about the DOM or React. The canvas component feeds it
 * pointer/keyboard input and draws `getRenderState()`; the toolbar reads
 * `getState()`. That keeps every gesture testable without a browser.
 */
export class Editor {
  readonly store: BoardStore

  private camera: Camera = { x: 0, y: 0, zoom: 1 }
  private viewport = { w: 0, h: 0 }
  private tool: Tool = 'select'
  private selection: readonly string[] = []
  private editingId: string | null = null
  private colors: Record<ColorFamily, ColorName> = { fill: 'yellow', ink: 'gray' }
  private spaceHeld = false
  private interaction: Interaction = { kind: 'idle' }
  private pointer: Point = { x: 0, y: 0 }
  private pointerInside = false
  private docVersion = 0

  private state: EditorState
  private readonly measureText: (text: string) => number
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribeStore: () => void

  constructor(store: BoardStore, options: EditorOptions = {}) {
    this.store = store
    this.measureText = options.measureText ?? ((text) => text.length * FONT_SIZE * 0.5)
    this.state = this.buildState()
    this.unsubscribeStore = store.subscribe(() => {
      this.docVersion++
      // Shapes can disappear under us (deleted here, undone, or by someone else).
      this.selection = this.selection.filter((id) => store.get(id))
      if (this.editingId && !store.get(this.editingId)) this.editingId = null
      this.emit()
    })
  }

  destroy(): void {
    this.unsubscribeStore()
    this.listeners.clear()
  }

  // ---- State for the UI and the renderer ----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = (): EditorState => this.state

  /** What to draw, apart from other people (the canvas adds those). */
  getRenderState(): Omit<RenderState, 'peers'> {
    const i = this.interaction
    return {
      shapes: this.store.list(),
      camera: this.camera,
      selection: this.selection,
      marquee: i.kind === 'marquee' ? rectFromPoints(i.startWorld, i.currentWorld) : null,
      editingId: this.editingId,
      draft: this.getDraft(),
    }
  }

  /** The pen stroke being drawn, if any. Also shared live with other people. */
  getDraft(): Draft | null {
    const i = this.interaction
    return i.kind === 'draw' ? { color: this.colors.ink, points: i.points } : null
  }

  /** True while a pen stroke is in progress (the canvas then feeds us every sample). */
  isDrawing(): boolean {
    return this.interaction.kind === 'draw'
  }

  /** CSS cursor for the current tool and whatever is under the pointer. */
  getCursor(): string {
    const i = this.interaction
    if (i.kind === 'pan') return 'grabbing'
    if (i.kind === 'resize') return RESIZE_CURSOR[i.handle]
    if (i.kind === 'move' && i.dragged) return 'move'
    if (this.spaceHeld || this.tool === 'hand') return 'grab'
    if (this.tool === 'text') return 'text'
    if (this.tool !== 'select') return 'crosshair'

    const world = screenToWorld(this.camera, this.pointer)
    const grab = this.grabUnder(world)
    if (grab) return grab.kind === 'resize' ? RESIZE_CURSOR[grab.handle] : 'crosshair'
    return this.shapeAt(world) ? 'move' : 'default'
  }

  private colorFamily(): ColorFamily {
    if (isShapeTool(this.tool)) return familyOf(this.tool)
    const first = this.selection[0] && this.store.get(this.selection[0])
    return first ? familyOf(first.type) : 'fill'
  }

  private buildState(): EditorState {
    const colorFamily = this.colorFamily()
    return {
      tool: this.tool,
      selection: this.selection,
      camera: this.camera,
      editingId: this.editingId,
      color: this.colors[colorFamily],
      colorFamily,
      canUndo: this.store.canUndo(),
      canRedo: this.store.canRedo(),
      docVersion: this.docVersion,
    }
  }

  private emit(): void {
    this.state = this.buildState()
    for (const listener of this.listeners) listener()
  }

  // ---- Tools, colour, selection ----

  setTool(tool: Tool): void {
    this.endEditing()
    this.tool = tool
    if (isShapeTool(tool)) this.selection = []
    this.emit()
  }

  /** Sets the colour for new shapes and recolours the current selection. */
  setColor(color: ColorName): void {
    this.colors[this.colorFamily()] = color
    this.store.commit()
    this.store.transact(() => {
      for (const id of this.selection) this.store.update(id, { color })
    })
    this.emit()
  }

  selectAll(): void {
    this.selection = this.store.list().map((s) => s.id)
    this.emit()
  }

  /** Escape: stop editing, then drop the tool, then clear the selection. */
  cancel(): void {
    if (this.editingId) this.endEditing()
    else if (this.tool !== 'select') this.tool = 'select'
    else this.selection = []
    this.interaction = { kind: 'idle' }
    this.emit()
  }

  deleteSelection(): void {
    this.store.commit()
    this.store.remove(this.selection)
  }

  duplicateSelection(): void {
    const copies: string[] = []
    this.store.commit()
    this.store.transact(() => {
      let z = this.store.topZ()
      for (const id of this.selection) {
        const shape = this.store.get(id)
        if (!shape) continue
        const copy: Shape = {
          ...shape,
          id: newId(),
          x: shape.x + DUPLICATE_OFFSET,
          y: shape.y + DUPLICATE_OFFSET,
          z: z++,
        }
        this.store.add(copy)
        copies.push(copy.id)
      }
    })
    this.selection = copies
    this.emit()
  }

  nudgeSelection(dx: number, dy: number): void {
    this.store.transact(() => {
      for (const id of this.selection) {
        const shape = this.store.get(id)
        if (shape) this.store.update(id, { x: shape.x + dx, y: shape.y + dy })
      }
    })
  }

  /** Move the selection above (or below) everything else, keeping its order. */
  reorderSelection(to: 'front' | 'back'): void {
    const selected = new Set(this.selection)
    const shapes = this.store.list().filter((s) => selected.has(s.id))
    this.store.commit()
    this.store.transact(() => {
      let z = to === 'front' ? this.store.topZ() : this.store.bottomZ() - shapes.length + 1
      for (const shape of shapes) this.store.update(shape.id, { z: z++ })
    })
  }

  /** Undo and redo only ever touch this person's own edits. */
  undo(): void {
    this.endEditing()
    this.store.undo()
    this.emit()
  }

  redo(): void {
    this.endEditing()
    this.store.redo()
    this.emit()
  }

  // ---- Text editing ----

  startEditing(id: string): void {
    const shape = this.store.get(id)
    if (!shape || shape.type === 'pen' || shape.type === 'arrow') return
    this.store.commit()
    this.selection = [id]
    this.editingId = id
    this.emit()
  }

  stopEditing(): void {
    if (!this.editingId) return
    this.endEditing()
    this.emit()
  }

  private endEditing(): void {
    const shape = this.editingId ? this.store.get(this.editingId) : undefined
    this.editingId = null
    this.store.commit()
    // A text shape with nothing in it is invisible; don't leave it behind.
    if (shape?.type === 'text' && shape.text.trim() === '') this.store.remove([shape.id])
  }

  setText(id: string, text: string): void {
    const shape = this.store.get(id)
    if (!shape) return
    if (shape.type !== 'text') {
      this.store.update(id, { text })
      return
    }
    // A text shape's box is exactly its text, at whatever scale it has.
    const scale = textScale(shape)
    const size = textBlockSize(text, this.measureText)
    this.store.update(id, { text, w: size.w * scale, h: size.h * scale })
  }

  // ---- Camera ----

  setViewport(w: number, h: number): void {
    // First layout: put the world origin in the middle of the screen.
    if (this.viewport.w === 0 && this.viewport.h === 0 && this.camera.x === 0) {
      this.camera = { ...this.camera, x: -w / 2 / this.camera.zoom, y: -h / 2 / this.camera.zoom }
    }
    this.viewport = { w, h }
    this.emit()
  }

  wheel(input: WheelInput): void {
    if (input.zoom) {
      const factor = Math.exp(-input.deltaY * 0.01)
      this.camera = zoomAt(this.camera, input, this.camera.zoom * factor)
    } else {
      this.camera = {
        ...this.camera,
        x: this.camera.x + input.deltaX / this.camera.zoom,
        y: this.camera.y + input.deltaY / this.camera.zoom,
      }
    }
    this.emit()
  }

  /** Zoom around the centre of the viewport (toolbar buttons). */
  setZoom(zoom: number): void {
    const center = { x: this.viewport.w / 2, y: this.viewport.h / 2 }
    this.camera = zoomAt(this.camera, center, clampZoom(zoom))
    this.emit()
  }

  /** Centre the view on a world point, e.g. to jump to someone's cursor. */
  centerOn(world: Point): void {
    this.camera = {
      ...this.camera,
      x: world.x - this.viewport.w / 2 / this.camera.zoom,
      y: world.y - this.viewport.h / 2 / this.camera.zoom,
    }
    this.emit()
  }

  /** World position under the pointer, or null when it is off the board. */
  getPointerWorld(): Point | null {
    return this.pointerInside ? screenToWorld(this.camera, this.pointer) : null
  }

  pointerLeave(): void {
    this.pointerInside = false
    this.emit()
  }

  setSpaceHeld(held: boolean): void {
    if (this.spaceHeld === held) return
    this.spaceHeld = held
    this.emit()
  }

  // ---- Pointer gestures ----

  pointerDown(p: PointerInput): void {
    this.pointer = p
    this.pointerInside = true
    this.endEditing()
    const world = screenToWorld(this.camera, p)

    if (p.button === 1 || (p.button === 0 && (this.spaceHeld || this.tool === 'hand'))) {
      this.interaction = { kind: 'pan', startScreen: p, startCamera: this.camera }
    } else if (p.button !== 0) {
      // Other buttons do nothing, but editing has still ended.
    } else if (this.tool === 'select') {
      this.beginSelectGesture(p, world)
    } else if (this.tool === 'pen') {
      this.interaction = { kind: 'draw', points: [world.x, world.y] }
    } else if (this.tool !== 'hand') {
      this.interaction = {
        kind: 'create',
        type: this.tool,
        startScreen: p,
        startWorld: world,
        id: null,
      }
    }
    this.emit()
  }

  private beginSelectGesture(p: PointerInput, world: Point): void {
    const single = this.singleSelection()
    const grab = this.grabUnder(world)
    if (single && grab?.kind === 'resize') {
      this.interaction = {
        kind: 'resize',
        id: single.id,
        handle: grab.handle,
        startWorld: world,
        original: { x: single.x, y: single.y, w: single.w, h: single.h },
      }
      return
    }
    if (single && grab?.kind === 'endpoint') {
      const { start, end } = arrowEnds(single)
      this.interaction = {
        kind: 'endpoint',
        id: single.id,
        moving: grab.moving,
        fixed: grab.moving === 'end' ? start : end,
        creating: false,
      }
      return
    }

    const hit = this.shapeAt(world)
    if (!hit) {
      const base = p.shift ? this.selection : []
      this.selection = base
      this.interaction = { kind: 'marquee', startWorld: world, currentWorld: world, base }
      return
    }

    const wasSelected = this.selection.includes(hit.id)
    if (p.shift && wasSelected) {
      this.selection = this.selection.filter((id) => id !== hit.id)
      return
    }
    if (p.shift) this.selection = [...this.selection, hit.id]
    else if (!wasSelected) this.selection = [hit.id]

    const originals = new Map<string, Point>()
    for (const id of this.selection) {
      const shape = this.store.get(id)
      if (shape) originals.set(id, { x: shape.x, y: shape.y })
    }
    this.interaction = {
      kind: 'move',
      startScreen: p,
      startWorld: world,
      originals,
      dragged: false,
      collapseTo: wasSelected && !p.shift ? hit.id : null,
    }
  }

  pointerMove(p: PointerInput): void {
    this.pointer = p
    this.pointerInside = true
    const world = screenToWorld(this.camera, p)
    const i = this.interaction

    switch (i.kind) {
      case 'pan':
        this.camera = {
          ...i.startCamera,
          x: i.startCamera.x - (p.x - i.startScreen.x) / i.startCamera.zoom,
          y: i.startCamera.y - (p.y - i.startScreen.y) / i.startCamera.zoom,
        }
        break

      case 'move': {
        if (!i.dragged && distance(p, i.startScreen) < DRAG_THRESHOLD) break
        i.dragged = true
        const dx = world.x - i.startWorld.x
        const dy = world.y - i.startWorld.y
        this.store.transact(() => {
          for (const [id, start] of i.originals) {
            this.store.update(id, { x: start.x + dx, y: start.y + dy })
          }
        })
        break
      }

      case 'resize': {
        // Text scales as a whole, so it always keeps its proportions.
        const isText = this.store.get(i.id)?.type === 'text'
        this.store.update(
          i.id,
          resizeRect(i.original, i.handle, world.x - i.startWorld.x, world.y - i.startWorld.y, {
            minSize: MIN_SHAPE_SIZE,
            keepAspect: p.shift || isText,
          }),
        )
        break
      }

      case 'endpoint':
        this.store.update(
          i.id,
          i.moving === 'end' ? arrowFromEnds(i.fixed, world) : arrowFromEnds(world, i.fixed),
        )
        break

      case 'marquee': {
        i.currentWorld = world
        const area = rectFromPoints(i.startWorld, world)
        const inside = this.store
          .list()
          .filter((s) => rectsIntersect(s, area) && !i.base.includes(s.id))
          .map((s) => s.id)
        this.selection = [...i.base, ...inside]
        break
      }

      case 'create':
        this.dragCreate(i, p, world)
        break

      case 'draw': {
        // Skip moves too small to see; the rest is simplified on release.
        const last = { x: i.points[i.points.length - 2]!, y: i.points[i.points.length - 1]! }
        if (distance(world, last) * this.camera.zoom >= 1) i.points.push(world.x, world.y)
        break
      }

      case 'idle':
        break
    }
    this.emit()
  }

  private dragCreate(i: Interaction & { kind: 'create' }, p: PointerInput, world: Point): void {
    if (i.id) {
      this.store.update(i.id, rectFromPoints(i.startWorld, world))
      return
    }
    // Text is placed with a click; dragging the text tool does nothing extra.
    if (i.type === 'text' || distance(p, i.startScreen) < DRAG_THRESHOLD) return

    if (i.type === 'arrow') {
      // From here on it is the same gesture as dragging an arrow's head.
      const id = this.createShape('arrow', arrowFromEnds(i.startWorld, world))
      this.interaction = {
        kind: 'endpoint',
        id,
        fixed: i.startWorld,
        moving: 'end',
        creating: true,
      }
      return
    }
    i.id = this.createShape(i.type, rectFromPoints(i.startWorld, world))
  }

  pointerUp(p: PointerInput): void {
    this.pointer = p
    const i = this.interaction
    this.interaction = { kind: 'idle' }

    if (i.kind === 'move' && !i.dragged && i.collapseTo) {
      this.selection = [i.collapseTo]
    }
    if (i.kind === 'create') this.finishCreate(i)
    if (i.kind === 'endpoint' && i.creating) this.tool = 'select'
    if (i.kind === 'draw') this.finishStroke(i.points)

    // Whatever this gesture changed is one undo step.
    this.store.commit()
    this.emit()
  }

  private finishCreate(i: Interaction & { kind: 'create' }): void {
    const at = i.startWorld
    if (i.id) {
      // Dragged out: make sure it isn't too small to grab again.
      const shape = this.store.get(i.id)
      if (shape) {
        this.store.update(i.id, {
          w: Math.max(shape.w, MIN_SHAPE_SIZE),
          h: Math.max(shape.h, MIN_SHAPE_SIZE),
        })
      }
    } else if (i.type === 'text') {
      // An empty text block, one line tall, with its first line at the pointer.
      const size = textBlockSize('', this.measureText)
      this.editingId = this.createShape('text', { x: at.x, y: at.y - LINE_HEIGHT / 2, ...size })
    } else if (i.type === 'arrow') {
      this.createShape(
        'arrow',
        arrowFromEnds(
          { x: at.x - DEFAULT_ARROW_LENGTH / 2, y: at.y },
          { x: at.x + DEFAULT_ARROW_LENGTH / 2, y: at.y },
        ),
      )
    } else if (isBoxType(i.type)) {
      // Plain click: drop a default-sized shape centred on the pointer.
      const size = DEFAULT_SIZE[i.type]
      const id = this.createShape(i.type, { x: at.x - size.w / 2, y: at.y - size.h / 2, ...size })
      if (i.type === 'sticky') this.editingId = id
    }
    this.tool = 'select'
  }

  /** Turn the drawn points into a saved pen shape. The pen stays active. */
  private finishStroke(raw: number[]): void {
    // Half a screen pixel of error is invisible but removes most points.
    const points = simplifyPoints(raw, 0.5 / this.camera.zoom)
    let left = Infinity
    let top = Infinity
    for (let n = 0; n < points.length; n += 2) {
      left = Math.min(left, points[n]!)
      top = Math.min(top, points[n + 1]!)
    }
    const relative = points.map((v, n) => v - (n % 2 === 0 ? left : top))
    // A click without movement becomes a dot.
    if (relative.length === 2) relative.push(0.1, 0.1)

    const size = pointsSize(relative)
    this.store.add({
      id: newId(),
      type: 'pen',
      x: left,
      y: top,
      w: Math.max(size.w, 1),
      h: Math.max(size.h, 1),
      color: this.colors.ink,
      text: '',
      z: this.store.topZ(),
      points: relative,
    })
  }

  /** Double-click: edit the shape's text, or drop a new sticky on empty space. */
  doubleClick(p: PointerInput): void {
    if (this.tool !== 'select') return
    const world = screenToWorld(this.camera, p)
    const hit = this.shapeAt(world)
    if (hit) {
      this.startEditing(hit.id)
      return
    }
    const size = DEFAULT_SIZE.sticky
    const id = this.createShape('sticky', {
      x: world.x - size.w / 2,
      y: world.y - size.h / 2,
      ...size,
    })
    this.startEditing(id)
  }

  // ---- Helpers ----

  private createShape(type: ShapeType, box: Rect & { flipX?: boolean; flipY?: boolean }): string {
    const id = newId()
    const color = this.colors[familyOf(type)]
    this.store.add({ id, type, ...box, color, text: '', z: this.store.topZ() })
    this.selection = [id]
    return id
  }

  /** Topmost shape under a world point, with some slack for thin lines. */
  private shapeAt(world: Point): Shape | undefined {
    return topShapeAt(this.store.list(), world, LINE_HIT_TOLERANCE / this.camera.zoom)
  }

  private singleSelection(): Shape | undefined {
    const [id, ...rest] = this.selection
    return id && rest.length === 0 ? this.store.get(id) : undefined
  }

  /** Handle of the single selected shape under `world`, if any. */
  private grabUnder(world: Point): Grab | null {
    const single = this.singleSelection()
    if (!single) return null
    const reach = HANDLE_SIZE / this.camera.zoom

    if (single.type === 'arrow') {
      const { start, end } = arrowEnds(single)
      if (distance(world, end) <= reach) return { kind: 'endpoint', moving: 'end' }
      if (distance(world, start) <= reach) return { kind: 'endpoint', moving: 'start' }
      return null
    }
    const handle = handleAt(single, world, reach, handlesFor(single.type))
    return handle ? { kind: 'resize', handle } : null
  }
}
