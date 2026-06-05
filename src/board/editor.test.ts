import { beforeEach, describe, expect, it } from 'vitest'
import { Editor, type PointerInput } from './editor'
import { BoardStore } from './store'

const at = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  x,
  y,
  button: 0,
  shift: false,
  ...extra,
})

let store: BoardStore
let editor: Editor

/** Press at `from`, move to `to`, release. */
function drag(from: PointerInput, to: PointerInput) {
  editor.pointerDown(from)
  editor.pointerMove(to)
  editor.pointerUp(to)
}

function click(p: PointerInput) {
  editor.pointerDown(p)
  editor.pointerUp(p)
}

/** Draw a rectangle by dragging between two screen points. */
function drawRect(x1: number, y1: number, x2: number, y2: number): string {
  editor.setTool('rect')
  drag(at(x1, y1), at(x2, y2))
  return editor.getState().selection[0]!
}

beforeEach(() => {
  store = new BoardStore()
  editor = new Editor(store)
  // No setViewport call, so the camera stays at the origin: screen == world.
})

describe('creating shapes', () => {
  it('drags out a rectangle and returns to the select tool', () => {
    const id = drawRect(100, 100, 300, 250)
    expect(store.get(id)).toMatchObject({
      type: 'rect',
      x: 100,
      y: 100,
      w: 200,
      h: 150,
    })
    expect(editor.getState().tool).toBe('select')
  })

  it('drops a default-sized sticky on click and starts editing it', () => {
    editor.setTool('sticky')
    click(at(500, 500))
    const [sticky] = store.list()
    expect(sticky).toMatchObject({
      type: 'sticky',
      x: 400,
      y: 400,
      w: 200,
      h: 200,
    })
    expect(editor.getState().editingId).toBe(sticky!.id)
  })

  it('uses the chosen colour', () => {
    editor.setColor('green')
    const id = drawRect(0, 0, 50, 50)
    expect(store.get(id)?.color).toBe('green')
  })

  it('creates a sticky when double-clicking empty space', () => {
    editor.doubleClick(at(0, 0))
    expect(store.list()).toHaveLength(1)
    expect(editor.getState().editingId).toBe(store.list()[0]!.id)
  })
})

describe('selecting', () => {
  it('selects on click and clears on empty click', () => {
    const id = drawRect(0, 0, 100, 100)
    click(at(500, 500))
    expect(editor.getState().selection).toEqual([])
    click(at(50, 50))
    expect(editor.getState().selection).toEqual([id])
  })

  it('toggles with shift-click', () => {
    const a = drawRect(0, 0, 100, 100)
    const b = drawRect(200, 0, 300, 100)
    click(at(50, 50))
    click(at(250, 50, { shift: true }))
    expect(editor.getState().selection).toEqual([a, b])
    click(at(50, 50, { shift: true }))
    expect(editor.getState().selection).toEqual([b])
  })

  it('selects everything a marquee touches', () => {
    const a = drawRect(0, 0, 100, 100)
    const b = drawRect(200, 0, 300, 100)
    drawRect(1000, 1000, 1100, 1100)
    drag(at(150, 400), at(50, 50))
    expect(editor.getState().selection).toEqual([a])
    drag(at(-10, 400), at(250, 50))
    expect([...editor.getState().selection].sort()).toEqual([a, b].sort())
  })

  it('picks the shape on top when shapes overlap', () => {
    drawRect(0, 0, 100, 100)
    const top = drawRect(50, 50, 150, 150)
    click(at(500, 500))
    click(at(75, 75))
    expect(editor.getState().selection).toEqual([top])
  })
})

describe('moving and resizing', () => {
  it('moves every selected shape by the drag distance', () => {
    const a = drawRect(0, 0, 100, 100)
    const b = drawRect(200, 0, 300, 100)
    editor.selectAll()
    drag(at(50, 50), at(80, 90))
    expect(store.get(a)).toMatchObject({ x: 30, y: 40 })
    expect(store.get(b)).toMatchObject({ x: 230, y: 40 })
    // A drag keeps the multi-selection; a plain click narrows it.
    expect(editor.getState().selection).toHaveLength(2)
    click(at(60, 60))
    expect(editor.getState().selection).toEqual([a])
  })

  it('ignores a jitter smaller than the drag threshold', () => {
    const id = drawRect(0, 0, 100, 100)
    drag(at(50, 50), at(51, 51))
    expect(store.get(id)).toMatchObject({ x: 0, y: 0 })
  })

  it('resizes from a handle', () => {
    const id = drawRect(0, 0, 100, 100)
    drag(at(100, 100), at(160, 130))
    expect(store.get(id)).toMatchObject({ x: 0, y: 0, w: 160, h: 130 })
  })

  it('moves in world units when zoomed', () => {
    const id = drawRect(0, 0, 100, 100)
    editor.wheel({
      x: 0,
      y: 0,
      deltaX: 0,
      deltaY: -Math.log(2) * 100,
      zoom: true,
    })
    expect(editor.getState().camera.zoom).toBeCloseTo(2)
    drag(at(100, 100), at(140, 100))
    expect(store.get(id)?.x).toBeCloseTo(20)
  })
})

describe('commands', () => {
  it('deletes the selection', () => {
    drawRect(0, 0, 100, 100)
    editor.deleteSelection()
    expect(store.list()).toEqual([])
    expect(editor.getState().selection).toEqual([])
  })

  it('duplicates with an offset and selects the copy', () => {
    const id = drawRect(0, 0, 100, 100)
    editor.duplicateSelection()
    const [copyId] = editor.getState().selection
    expect(copyId).not.toBe(id)
    expect(store.get(copyId!)).toMatchObject({ x: 20, y: 20, w: 100, h: 100 })
  })

  it('reorders to front and back', () => {
    const a = drawRect(0, 0, 100, 100)
    const b = drawRect(50, 50, 150, 150)
    click(at(10, 10))
    editor.reorderSelection('front')
    expect(store.list().map((s) => s.id)).toEqual([b, a])
    editor.reorderSelection('back')
    expect(store.list().map((s) => s.id)).toEqual([a, b])
  })

  it('drops the selection when another client deletes the shape', () => {
    const id = drawRect(0, 0, 100, 100)
    editor.startEditing(id)
    store.doc.getMap('shapes').delete(id)
    expect(editor.getState()).toMatchObject({ selection: [], editingId: null })
  })

  it('pans with the hand tool without touching shapes', () => {
    const id = drawRect(0, 0, 100, 100)
    editor.setTool('hand')
    drag(at(50, 50), at(150, 80))
    expect(store.get(id)).toMatchObject({ x: 0, y: 0 })
    expect(editor.getState().camera).toMatchObject({ x: -100, y: -30 })
  })
})
