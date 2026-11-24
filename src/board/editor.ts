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
  unionRects,
  zoomAt,
  type Camera,
  type Handle,
  type Point,
  type Rect,
} from './geometry'
import type { Draft } from './presence'
import { snapMove, snapPoint, snapResize, type Guide } from './snapping'
import { HANDLE_SIZE, type RenderState } from './render'
import type { BoardStore, ShapePatch } from './store'
import {
  FONT_SIZE,
  clampFontSize,
  fontSizeOf,
  LINE_HEIGHT,
  textAlignOf,
  textBlockSize,
  textScale,
  type FontStyle,
  type Measure,
} from './text'
import {
  hasText,
  isBoxType,
  type BoxType,
  type ColorName,
  type Shape,
  type ShapeType,
  type TextAlign,
  type Tool,
} from './types'

/** A pointer event reduced to what the editor needs; x/y are canvas pixels. */
export interface PointerInput {
  x: number
  y: number
  button: number
  shift: boolean
  /** Ctrl or Cmd held: turn snapping off for this gesture. */
  ctrl?: boolean
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
  /** View-only board: panning and zooming work, nothing can be changed. */
  readOnly: boolean
  /** Bumps on every document change so the UI re-reads shapes. */
  docVersion: number
}

export interface EditorOptions {
  /** Width of a string at the base font size. Injected so tests need no DOM. */
  measureText?: Measure
}

/** The formatting of the selected shapes that hold text, as the format panel shows it. */
export interface TextFormat {
  /** Text size in board units; null when the shapes differ. */
  fontSize: number | null
  /** Each is true only if it is on for every one of the shapes. */
  bold: boolean
  italic: boolean
  strike: boolean
  /** Null when the shapes differ. */
  align: TextAlign | null
}

export type TextFormatPatch = Partial<{
  fontSize: number
  bold: boolean
  italic: boolean
  strike: boolean
  align: TextAlign
}>

type Interaction =
  | { kind: 'idle' }
  | { kind: 'pan'; startScreen: Point; startCamera: Camera }
  | {
      kind: 'move'
      startScreen: Point
      startWorld: Point
      originals: Map<string, Shape>
      dragged: boolean
      /** Plain click on an already-selected shape narrows the selection to it. */
      collapseTo: string | null
    }
  | { kind: 'resize'; id: string; handle: Handle; startWorld: Point; original: Rect }
  /** Dragging one end of an arrow while the other stays put. */
  | {
      kind: 'endpoint'
      id: string
      fixed: Point
      moving: 'start' | 'end'
      creating: boolean
      /** Shape under the pointer that the moving end is attached to. */
      targetId: string | null
    }
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
/** Screen pixels within which an edge or centre snaps to another shape's. */
const SNAP_DISTANCE = 6
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

/**
 * The edit that moves a shape by (dx, dy). An attached arrow end follows its
 * shape, so it only stays attached if that shape is `kept` (moving along, or
 * not being deleted); otherwise the end is set free at its current position.
 */
function movedPatch(
  shape: Shape,
  dx: number,
  dy: number,
  kept: (id: string) => boolean,
): ShapePatch {
  const position = { x: shape.x + dx, y: shape.y + dy }
  if (shape.type !== 'arrow' || (!shape.startId && !shape.endId)) return position
  // Write the whole geometry: what is stored for an attached arrow can be
  // out of date, because its real position is worked out from its shapes.
  return {
    ...position,
    w: shape.w,
    h: shape.h,
    flipX: shape.flipX,
    flipY: shape.flipY,
    startId: shape.startId && kept(shape.startId) ? shape.startId : null,
    endId: shape.endId && kept(shape.endId) ? shape.endId : null,
  }
}

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
  /** Alignment guides to draw while a move, resize or creation is snapping. */
  private guides: Guide[] = []
  private interacted = false
  private docVersion = 0

  private state: EditorState
  private readonly measureText: Measure
  private readonly listeners = new Set<() => void>()
  private readonly navigateListeners = new Set<() => void>()
  private readonly unsubscribeStore: () => void

  constructor(store: BoardStore, options: EditorOptions = {}) {
    this.store = store
    this.measureText =
      options.measureText ?? ((text, style) => text.length * FONT_SIZE * (style?.bold ? 0.55 : 0.5))
    if (store.readOnly) this.tool = 'hand'
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
    this.navigateListeners.clear()
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
      attachTargetId: i.kind === 'endpoint' ? i.targetId : null,
      guides: this.guides,
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
      readOnly: this.store.readOnly,
      docVersion: this.docVersion,
    }
  }

  private emit(): void {
    this.state = this.buildState()
    for (const listener of this.listeners) listener()
  }

  // ---- Tools, colour, selection ----

  /** Switch between editing and view-only, as the server grants or withdraws access. */
  setReadOnly(readOnly: boolean): void {
    if (this.store.readOnly === readOnly) return
    this.endEditing()
    this.store.readOnly = readOnly
    this.interaction = { kind: 'idle' }
    this.selection = []
    // Viewers can only pan; editors start with the select tool.
    this.tool = readOnly ? 'hand' : 'select'
    this.emit()
  }

  setTool(tool: Tool): void {
    if (this.store.readOnly) return
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
    if (this.store.readOnly) return
    this.selection = this.store.list().map((s) => s.id)
    this.emit()
  }

  /** Escape: stop editing, then drop the tool, then clear the selection. */
  cancel(): void {
    this.userNavigated()
    if (this.editingId) this.endEditing()
    else if (this.tool !== 'select') this.tool = 'select'
    else this.selection = []
    this.interaction = { kind: 'idle' }
    this.emit()
  }

  deleteSelection(): void {
    const doomed = new Set(this.selection)
    // Arrows attached to something being deleted stay where they are drawn
    // now, with that end set free.
    const orphaned = this.store
      .list()
      .filter((s) => !doomed.has(s.id) && this.attachments(s).some((id) => doomed.has(id)))
    this.store.commit()
    this.store.transact(() => {
      for (const arrow of orphaned) {
        this.store.update(
          arrow.id,
          movedPatch(arrow, 0, 0, (id) => !doomed.has(id)),
        )
      }
      this.store.remove(this.selection)
    })
  }

  duplicateSelection(): void {
    const originals = this.selection
      .map((id) => this.store.get(id))
      .filter((shape): shape is Shape => shape !== undefined)
    const copyId = new Map(originals.map((shape) => [shape.id, newId()]))

    this.store.commit()
    this.store.transact(() => {
      let z = this.store.topZ()
      for (const shape of originals) {
        this.store.add({
          ...shape,
          id: copyId.get(shape.id)!,
          x: shape.x + DUPLICATE_OFFSET,
          y: shape.y + DUPLICATE_OFFSET,
          z: z++,
          // A copied arrow attaches to the copies of its shapes, if they were
          // copied too; otherwise that end is free.
          startId: shape.startId && copyId.get(shape.startId),
          endId: shape.endId && copyId.get(shape.endId),
        })
      }
    })
    this.selection = [...copyId.values()]
    this.emit()
  }

  /**
   * Delete every shape on the board, for everyone. It is one undo step, so
   * this person can bring the whole board back, other people's shapes too.
   */
  clearBoard(): void {
    if (this.store.readOnly) return
    const ids = this.store.list().map((s) => s.id)
    this.endEditing()
    this.interaction = { kind: 'idle' }
    this.selection = []
    if (ids.length > 0) {
      this.store.commit()
      this.store.remove(ids)
      this.store.commit()
    }
    this.emit()
  }

  // ---- Text formatting ----

  /**
   * Selected shapes with text to format: ones that have some, and the one
   * being typed into. A shape just drawn, with no text, has nothing to format.
   */
  private textTargets(): Shape[] {
    if (isShapeTool(this.tool)) return []
    return this.selection
      .map((id) => this.store.get(id))
      .filter(
        (shape): shape is Shape =>
          shape !== undefined &&
          hasText(shape.type) &&
          (shape.text.trim() !== '' || shape.id === this.editingId),
      )
  }

  /** The selection's text formatting, or null when there is no text to format. */
  getTextFormat(): TextFormat | null {
    const shapes = this.textTargets()
    if (shapes.length === 0) return null
    const only = <T>(values: T[]): T | null => (new Set(values).size === 1 ? values[0]! : null)
    return {
      fontSize: only(shapes.map(fontSizeOf)),
      bold: shapes.every((s) => s.bold === true),
      italic: shapes.every((s) => s.italic === true),
      strike: shapes.every((s) => s.strike === true),
      align: only(shapes.map(textAlignOf)),
    }
  }

  /** Format the text of every selected shape that holds text, as one undo step. */
  setTextFormat(patch: TextFormatPatch): void {
    const shapes = this.textTargets()
    if (shapes.length === 0 || this.store.readOnly) return
    this.store.commit()
    this.store.transact(() => {
      for (const shape of shapes) {
        const { fontSize: requested, ...rest } = patch
        const fontSize = requested === undefined ? undefined : clampFontSize(requested)
        const update: ShapePatch = { ...rest }
        if (shape.type === 'text') {
          // A text shape's box is its text, so a size or weight change resizes it.
          const style: FontStyle = {
            bold: patch.bold ?? shape.bold,
            italic: patch.italic ?? shape.italic,
          }
          const scale = fontSize ? fontSize / FONT_SIZE : textScale(shape)
          const size = textBlockSize(shape.text, (s) => this.measureText(s, style))
          update.w = size.w * scale
          update.h = size.h * scale
        } else if (fontSize) {
          update.fontSize = fontSize
        }
        this.store.update(shape.id, update)
      }
    })
    this.store.commit()
    this.emit()
  }

  /** Bold, italic or strikethrough: on for all the selection, or off if it already was. */
  toggleTextFormat(key: 'bold' | 'italic' | 'strike'): void {
    const format = this.getTextFormat()
    if (format) this.setTextFormat({ [key]: !format[key] })
  }

  nudgeSelection(dx: number, dy: number): void {
    const moving = new Set(this.selection)
    this.store.transact(() => {
      for (const id of this.selection) {
        const shape = this.store.get(id)
        if (shape)
          this.store.update(
            id,
            movedPatch(shape, dx, dy, (other) => moving.has(other)),
          )
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

  /**
   * Add a batch of sticky notes (the AI's action items) in a grid to the
   * right of everything on the board, select them and bring them into view.
   */
  addStickies(texts: readonly string[], coveredRight = 0, color: ColorName = 'green'): void {
    if (texts.length === 0 || this.store.readOnly) return
    this.endEditing()
    const { w, h } = DEFAULT_SIZE.sticky
    const gap = 24
    const columns = Math.min(4, texts.length)
    const bounds = unionRects(this.store.list())
    const left = bounds ? bounds.x + bounds.w + gap * 3 : -((w + gap) * columns - gap) / 2
    const top = bounds ? bounds.y : -h / 2

    const ids: string[] = []
    this.store.commit()
    this.store.transact(() => {
      let z = this.store.topZ()
      texts.forEach((text, n) => {
        const id = newId()
        ids.push(id)
        this.store.add({
          id,
          type: 'sticky',
          x: left + (n % columns) * (w + gap),
          y: top + Math.floor(n / columns) * (h + gap),
          w,
          h,
          color,
          text,
          z: z++,
        })
      })
    })
    this.store.commit()

    this.tool = 'select'
    this.selection = ids
    const rows = Math.ceil(texts.length / columns)
    // `coveredRight` is how much of the screen's right side a panel hides;
    // centre the notes in the part that is actually visible.
    this.centerOn({
      x: left + ((w + gap) * columns - gap) / 2 + coveredRight / 2 / this.camera.zoom,
      y: top + ((h + gap) * rows - gap) / 2,
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
    if (this.store.readOnly) return
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
    const size = textBlockSize(text, (s) => this.measureText(s, shape))
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
    this.interacted = true
    this.userNavigated()
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
    this.userNavigated()
    this.camera = zoomAt(this.camera, center, clampZoom(zoom))
    this.emit()
  }

  /** Called whenever the user moves the view themselves (not when following). */
  onUserNavigate(listener: () => void): () => void {
    this.navigateListeners.add(listener)
    return () => this.navigateListeners.delete(listener)
  }

  private userNavigated(): void {
    for (const listener of this.navigateListeners) listener()
  }

  /** The part of the board on screen, in world coordinates. */
  getViewRect(): Rect {
    const { x, y, zoom } = this.camera
    return { x, y, w: this.viewport.w / zoom, h: this.viewport.h / zoom }
  }

  /** The camera that shows all of `rect`, centred, as large as fits. */
  cameraForRect(rect: Rect): Camera {
    const { w, h } = this.viewport
    const zoom = clampZoom(Math.min(w / rect.w, h / rect.h))
    return {
      zoom,
      x: rect.x + rect.w / 2 - w / 2 / zoom,
      y: rect.y + rect.h / 2 - h / 2 / zoom,
    }
  }

  /** Move the view on someone else's behalf (follow mode). */
  followCamera(camera: Camera): void {
    this.camera = camera
    this.emit()
  }

  /** Fit everything on the board into view, never zooming in past 100%. */
  zoomToFit(): void {
    const bounds = unionRects(this.store.list())
    const { w, h } = this.viewport
    if (!bounds || w === 0 || h === 0) return
    this.userNavigated()
    const margin = 80
    const zoom = clampZoom(Math.min(1, (w - margin * 2) / bounds.w, (h - margin * 2) / bounds.h))
    this.camera = {
      zoom,
      x: bounds.x + bounds.w / 2 - w / 2 / zoom,
      y: bounds.y + bounds.h / 2 - h / 2 / zoom,
    }
    this.emit()
  }

  /**
   * Two-finger gesture on a touch screen: the point between the fingers moved
   * from `from` to `to` (screen pixels) while they spread by `scale`.
   */
  pinch(from: Point, to: Point, scale: number): void {
    this.interacted = true
    this.userNavigated()
    const zoomed = zoomAt(this.camera, from, this.camera.zoom * scale)
    this.camera = {
      ...zoomed,
      x: zoomed.x - (to.x - from.x) / zoomed.zoom,
      y: zoomed.y - (to.y - from.y) / zoomed.zoom,
    }
    this.emit()
  }

  /** Drop whatever gesture is in progress (a second finger touched down). */
  cancelGesture(): void {
    this.interaction = { kind: 'idle' }
    this.guides = []
    this.store.commit()
    this.emit()
  }

  /** Has the user panned, zoomed or clicked yet? (Stops automatic framing.) */
  hasInteracted(): boolean {
    return this.interacted
  }

  /** Centre the view on a world point, e.g. to jump to someone's cursor. */
  centerOn(world: Point): void {
    this.userNavigated()
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
    this.interacted = true
    this.pointerInside = true
    this.endEditing()
    const world = screenToWorld(this.camera, p)

    if (p.button === 1 || (p.button === 0 && (this.spaceHeld || this.tool === 'hand'))) {
      this.interaction = { kind: 'pan', startScreen: p, startCamera: this.camera }
      this.userNavigated()
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
        targetId: null,
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

    const originals = new Map<string, Shape>()
    for (const id of this.selection) {
      const shape = this.store.get(id)
      if (shape) originals.set(id, shape)
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
        let dx = world.x - i.startWorld.x
        let dy = world.y - i.startWorld.y
        // Snap the selection's bounding box to the shapes around it. An
        // arrow's box is just its two ends, so arrows do not count.
        const bounds = unionRects([...i.originals.values()].filter((s) => s.type !== 'arrow'))
        if (bounds && !p.ctrl) {
          const snap = snapMove(
            { ...bounds, x: bounds.x + dx, y: bounds.y + dy },
            this.snapTargets(new Set(i.originals.keys())),
            SNAP_DISTANCE / this.camera.zoom,
          )
          dx += snap.dx
          dy += snap.dy
          this.guides = snap.guides
        } else {
          this.guides = []
        }
        this.store.transact(() => {
          for (const [id, original] of i.originals) {
            this.store.update(
              id,
              movedPatch(original, dx, dy, (other) => i.originals.has(other)),
            )
          }
        })
        break
      }

      case 'resize': {
        // Text scales as a whole, so it always keeps its proportions.
        const isText = this.store.get(i.id)?.type === 'text'
        const keepAspect = p.shift || isText
        let rect = resizeRect(
          i.original,
          i.handle,
          world.x - i.startWorld.x,
          world.y - i.startWorld.y,
          { minSize: MIN_SHAPE_SIZE, keepAspect },
        )
        this.guides = []
        // Snapping one edge would break a kept aspect ratio, so skip it then.
        if (!keepAspect && !p.ctrl) {
          const snap = snapResize(
            rect,
            i.handle,
            this.snapTargets(new Set([i.id])),
            SNAP_DISTANCE / this.camera.zoom,
            MIN_SHAPE_SIZE,
          )
          rect = snap.rect
          this.guides = snap.guides
        }
        this.store.update(i.id, rect)
        break
      }

      case 'endpoint':
        this.moveEndpoint(i, world)
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

  /** Put the dragged end of an arrow at `world`, attaching it if it is over a shape. */
  private moveEndpoint(i: Interaction & { kind: 'endpoint' }, world: Point): void {
    const arrow = this.store.get(i.id)
    const otherEnd = i.moving === 'end' ? arrow?.startId : arrow?.endId
    const target = this.attachableAt(world, i.id)
    // Both ends on the same shape would be a zero-length arrow; leave it free.
    i.targetId = target && target.id !== otherEnd ? target.id : null
    const box = i.moving === 'end' ? arrowFromEnds(i.fixed, world) : arrowFromEnds(world, i.fixed)
    this.store.update(i.id, {
      ...box,
      ...(i.moving === 'end' ? { endId: i.targetId } : { startId: i.targetId }),
    })
  }

  private dragCreate(i: Interaction & { kind: 'create' }, p: PointerInput, world: Point): void {
    if (i.id) {
      this.store.update(i.id, rectFromPoints(i.startWorld, this.snapCorner(world, p, i.id)))
      return
    }
    // Text is placed with a click; dragging the text tool does nothing extra.
    if (i.type === 'text' || distance(p, i.startScreen) < DRAG_THRESHOLD) return

    if (i.type === 'arrow') {
      // From here on it is the same gesture as dragging an arrow's head.
      // Starting on a shape attaches the tail to it.
      const id = this.createShape('arrow', {
        ...arrowFromEnds(i.startWorld, world),
        startId: this.attachableAt(i.startWorld)?.id,
      })
      const endpoint: Interaction & { kind: 'endpoint' } = {
        kind: 'endpoint',
        id,
        fixed: i.startWorld,
        moving: 'end',
        creating: true,
        targetId: null,
      }
      this.interaction = endpoint
      // The pointer may already be over another shape.
      this.moveEndpoint(endpoint, world)
      return
    }
    // Snapped from the very move that creates it, not only from the next one.
    i.id = this.createShape(i.type, rectFromPoints(i.startWorld, this.snapCorner(world, p, null)))
  }

  /** The corner being dragged out, snapped to nearby shapes unless Ctrl is held. */
  private snapCorner(world: Point, p: PointerInput, creatingId: string | null): Point {
    this.guides = []
    if (p.ctrl) return world
    const exclude = new Set(creatingId ? [creatingId] : [])
    const snap = snapPoint(world, this.snapTargets(exclude), SNAP_DISTANCE / this.camera.zoom)
    this.guides = snap.guides
    return snap.point
  }

  pointerUp(p: PointerInput): void {
    this.pointer = p
    const i = this.interaction
    this.interaction = { kind: 'idle' }
    this.guides = []

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

  private createShape(
    type: ShapeType,
    box: Rect & Pick<Shape, 'flipX' | 'flipY' | 'startId' | 'endId'>,
  ): string {
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

  /**
   * Shapes something can snap to: everything on or near the screen except
   * the shapes being changed, arrows and pen strokes (whose boxes are not
   * edges anyone would align to).
   */
  private snapTargets(exclude: ReadonlySet<string>): Rect[] {
    const view = this.getViewRect()
    const area = { x: view.x - view.w, y: view.y - view.h, w: view.w * 3, h: view.h * 3 }
    return this.store
      .list()
      .filter(
        (s) =>
          !exclude.has(s.id) && s.type !== 'arrow' && s.type !== 'pen' && rectsIntersect(s, area),
      )
  }

  /** Topmost shape an arrow end can attach to at a world point. */
  private attachableAt(world: Point, arrowId?: string): Shape | undefined {
    const candidates = this.store
      .list()
      .filter((s) => s.type !== 'arrow' && s.type !== 'pen' && s.id !== arrowId)
    return topShapeAt(candidates, world)
  }

  /** Ids of the shapes an arrow is attached to (empty for anything else). */
  private attachments(shape: Shape): string[] {
    return [shape.startId, shape.endId].filter((id): id is string => id !== undefined)
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
