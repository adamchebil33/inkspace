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

describe('pen', () => {
  function stroke(points: [number, number][]) {
    editor.setTool('pen')
    editor.pointerDown(at(...points[0]!))
    for (const p of points.slice(1)) editor.pointerMove(at(...p))
    editor.pointerUp(at(...points.at(-1)!))
  }

  it('saves a simplified stroke relative to its bounding box', () => {
    stroke([
      [100, 100],
      [110, 100],
      [120, 100],
      [130, 100],
      [130, 140],
    ])
    const [pen] = store.list()
    expect(pen).toMatchObject({ type: 'pen', x: 100, y: 100, w: 30, h: 40, color: 'gray' })
    expect(pen!.points).toEqual([0, 0, 30, 0, 30, 40])
  })

  it('exposes the stroke in progress and keeps the pen active afterwards', () => {
    editor.setTool('pen')
    editor.pointerDown(at(0, 0))
    editor.pointerMove(at(20, 20))
    expect(editor.getDraft()).toEqual({ color: 'gray', points: [0, 0, 20, 20] })
    expect(store.list()).toEqual([])

    editor.pointerUp(at(20, 20))
    expect(editor.getDraft()).toBeNull()
    expect(store.list()).toHaveLength(1)
    expect(editor.getState().tool).toBe('pen')
  })

  it('turns a click into a dot', () => {
    stroke([[50, 50]])
    expect(store.list()[0]).toMatchObject({ type: 'pen', x: 50, y: 50 })
  })

  it('keeps a separate colour for ink and for fills', () => {
    editor.setTool('pen')
    editor.setColor('red')
    stroke([
      [0, 0],
      [40, 40],
    ])
    const sticky = drawRect(200, 200, 300, 300)
    expect(store.list().find((s) => s.type === 'pen')?.color).toBe('red')
    expect(store.get(sticky)?.color).toBe('yellow')
  })

  it('can be selected by clicking near the line', () => {
    stroke([
      [0, 0],
      [100, 0],
      [100, 100],
    ])
    editor.setTool('select')
    click(at(50, 50))
    expect(editor.getState().selection).toEqual([])
    click(at(50, 3))
    expect(editor.getState().selection).toHaveLength(1)
  })
})

describe('arrows', () => {
  it('drags out an arrow in any direction', () => {
    editor.setTool('arrow')
    drag(at(200, 200), at(120, 260))
    const [arrow] = store.list()
    expect(arrow).toMatchObject({ type: 'arrow', x: 120, y: 200, w: 80, h: 60, flipX: true })
    expect(arrow!.flipY).toBe(false)
    expect(editor.getState().tool).toBe('select')
  })

  it('moves one end while the other stays put', () => {
    editor.setTool('arrow')
    drag(at(0, 0), at(100, 0))
    // Still selected: grab the head and drag it below and left of the tail.
    drag(at(100, 0), at(-50, 80))
    expect(store.list()[0]).toMatchObject({ x: -50, y: 0, w: 50, h: 80, flipX: true, flipY: false })
    // Now the tail.
    drag(at(0, 0), at(-50, 0))
    expect(store.list()[0]).toMatchObject({ x: -50, y: 0, w: 0, h: 80 })
  })
})

describe('text', () => {
  it('places text with a click and sizes the box to the text', () => {
    editor.setTool('text')
    click(at(100, 100))
    const id = editor.getState().editingId!
    expect(store.get(id)).toMatchObject({ type: 'text', x: 100 })

    // The test editor measures 8 units per character.
    editor.setText(id, 'hello\nworld!')
    expect(store.get(id)).toMatchObject({ w: 48, h: 42 })
  })

  it('removes a text shape that was left empty', () => {
    editor.setTool('text')
    click(at(100, 100))
    editor.stopEditing()
    expect(store.list()).toEqual([])
  })

  it('scales the text when resized and keeps that scale while typing', () => {
    editor.setTool('text')
    click(at(0, 0))
    const id = editor.getState().editingId!
    editor.setText(id, 'abcd')
    editor.stopEditing()
    const before = store.get(id)!

    // Drag the bottom-right corner out to twice the size.
    drag(
      at(before.x + before.w, before.y + before.h),
      at(before.x + before.w * 2, before.y + before.h * 2),
    )
    expect(store.get(id)).toMatchObject({ w: before.w * 2, h: before.h * 2 })

    editor.setText(id, 'abcdefgh')
    expect(store.get(id)).toMatchObject({ w: before.w * 4, h: before.h * 2 })
  })
})

describe('undo and redo', () => {
  it('treats each gesture as one step', () => {
    const id = drawRect(0, 0, 100, 100)
    editor.pointerDown(at(50, 50))
    for (let x = 60; x <= 200; x += 10) editor.pointerMove(at(x, 50))
    editor.pointerUp(at(200, 50))
    expect(store.get(id)?.x).toBe(150)

    editor.undo()
    expect(store.get(id)?.x).toBe(0)
    editor.undo()
    expect(store.list()).toEqual([])
    expect(editor.getState()).toMatchObject({ canUndo: false, canRedo: true })

    editor.redo()
    editor.redo()
    expect(store.get(id)?.x).toBe(150)
  })

  it('brings back deleted shapes', () => {
    drawRect(0, 0, 100, 100)
    editor.deleteSelection()
    editor.undo()
    expect(store.list()).toHaveLength(1)
  })
})

describe('addStickies', () => {
  it('lays notes out in a grid beside existing content, as one undo step', () => {
    drawRect(0, 0, 100, 100)
    editor.addStickies(['One', 'Two', 'Three', 'Four', 'Five'])

    const added = store.list().filter((s) => s.type === 'sticky')
    expect(added.map((s) => s.text)).toEqual(['One', 'Two', 'Three', 'Four', 'Five'])
    // Four per row, clear of the rectangle, with the fifth wrapping.
    expect(added.every((s) => s.x > 100)).toBe(true)
    expect(added[4]).toMatchObject({ x: added[0]!.x, y: added[0]!.y + 224 })
    expect(editor.getState().selection).toHaveLength(5)

    editor.undo()
    expect(store.list()).toHaveLength(1)
  })

  it('does nothing on a view-only board', () => {
    const viewer = new Editor(new BoardStore(undefined, { readOnly: true }))
    viewer.addStickies(['Nope'])
    expect(viewer.store.list()).toEqual([])
  })
})

describe('view', () => {
  it('zooms out to fit everything, centred, but never past 100%', () => {
    const rect = (id: string, x: number) =>
      store.add({ id, type: 'rect', x, y: 0, w: 100, h: 100, color: 'blue', text: '', z: 0 })
    editor.setViewport(1000, 800)

    // Small content: stays at 100% and is centred.
    rect('near', 0)
    editor.zoomToFit()
    expect(editor.getState().camera).toEqual({ zoom: 1, x: -450, y: -350 })

    rect('far', 3000)
    editor.zoomToFit()
    const { camera } = editor.getState()
    expect(camera.zoom).toBeCloseTo((1000 - 160) / 3100)
    // The middle of the content is in the middle of the screen.
    expect(camera.x + 500 / camera.zoom).toBeCloseTo(1550)
  })

  it('pinch zooms around the fingers and pans with them', () => {
    const before = { x: 400, y: 300 }
    editor.pinch(before, { x: 450, y: 300 }, 2)
    const { camera } = editor.getState()
    expect(camera.zoom).toBe(2)
    // The world point that was between the fingers followed them.
    expect((before.x - camera.x) * camera.zoom).toBeCloseTo(450)
    expect((before.y - camera.y) * camera.zoom).toBeCloseTo(300)
  })

  it('drops an unfinished pen stroke when a gesture is cancelled', () => {
    editor.setTool('pen')
    editor.pointerDown(at(0, 0))
    editor.pointerMove(at(50, 50))
    editor.cancelGesture()
    editor.pointerUp(at(50, 50))
    expect(store.list()).toEqual([])
  })
})

describe('arrows attached to shapes', () => {
  // Two 100x100 rectangles, 200 apart, joined by an arrow drawn from one to
  // the other.
  function connected() {
    const a = drawRect(0, 0, 100, 100)
    const b = drawRect(300, 0, 400, 100)
    editor.setTool('arrow')
    drag(at(50, 50), at(350, 50))
    const arrow = store.list().find((s) => s.type === 'arrow')!
    return { a, b, arrow: arrow.id }
  }
  const arrowOf = (id: string) => store.get(id)!

  it('attaches both ends when drawn from one shape to another', () => {
    const { a, b, arrow } = connected()
    expect(arrowOf(arrow)).toMatchObject({ startId: a, endId: b })
    // Drawn edge to edge, not centre to centre.
    expect(arrowOf(arrow)).toMatchObject({ x: 106, y: 50, w: 188, h: 0 })
  })

  it('follows a shape that is moved', () => {
    const { b, arrow } = connected()
    editor.setTool('select')
    drag(at(350, 50), at(350, 350))
    expect(store.get(b)).toMatchObject({ y: 300 })
    const moved = arrowOf(arrow)
    expect(moved.endId).toBe(b)
    expect(moved.y + moved.h).toBeGreaterThan(250)
  })

  it('stays attached when moved together with its shapes', () => {
    const { a, b, arrow } = connected()
    editor.selectAll()
    drag(at(50, 50), at(50, 250))
    expect(arrowOf(arrow)).toMatchObject({ startId: a, endId: b, x: 106, y: 250 })
  })

  it('comes loose when dragged away on its own', () => {
    const { arrow } = connected()
    editor.setTool('select')
    click(at(600, 600))
    drag(at(200, 50), at(200, 150))
    const loose = arrowOf(arrow)
    expect(loose.startId).toBeUndefined()
    expect(loose.endId).toBeUndefined()
    expect(loose).toMatchObject({ x: 106, y: 150, w: 188 })
  })

  it('keeps its place, set free, when the shape it points at is deleted', () => {
    const { a, b, arrow } = connected()
    const before = arrowOf(arrow)
    editor.setTool('select')
    click(at(350, 50))
    editor.deleteSelection()

    expect(store.get(b)).toBeUndefined()
    const after = arrowOf(arrow)
    expect(after).toMatchObject({ x: before.x, y: before.y, w: before.w, h: before.h })
    expect(after.startId).toBe(a)
    expect(after.endId).toBeUndefined()

    // Undo brings back both the shape and the attachment.
    editor.undo()
    expect(arrowOf(arrow).endId).toBe(b)
  })

  it('re-attaches an end dragged onto another shape, and frees one dropped on nothing', () => {
    const { arrow } = connected()
    const c = drawRect(300, 300, 400, 400)
    editor.setTool('select')
    click(at(200, 50))
    // Grab the head (on the edge of b) and drop it on c.
    const head = arrowOf(arrow)
    drag(at(head.x + head.w, head.y), at(350, 350))
    expect(arrowOf(arrow).endId).toBe(c)

    const again = arrowOf(arrow)
    drag(at(again.x + again.w, again.y + again.h), at(700, 700))
    expect(arrowOf(arrow).endId).toBeUndefined()
    expect(arrowOf(arrow)).toMatchObject({ w: 700 - arrowOf(arrow).x })
  })

  it('shows which shape an end will attach to while dragging', () => {
    const a = drawRect(0, 0, 100, 100)
    const b = drawRect(300, 0, 400, 100)
    editor.setTool('arrow')
    editor.pointerDown(at(50, 50))
    editor.pointerMove(at(200, 50))
    expect(editor.getRenderState().attachTargetId).toBeNull()
    editor.pointerMove(at(350, 50))
    expect(editor.getRenderState().attachTargetId).toBe(b)
    // The tail's own shape is never offered as the target for the head.
    editor.pointerMove(at(60, 60))
    expect(editor.getRenderState().attachTargetId).toBeNull()
    editor.pointerUp(at(60, 60))
    expect(store.list().find((s) => s.type === 'arrow')).toMatchObject({ startId: a })
  })

  it('copies attachments only between shapes that are copied together', () => {
    const { a, arrow } = connected()
    editor.selectAll()
    editor.duplicateSelection()
    const copies = editor.getState().selection.map((id) => store.get(id)!)
    const arrowCopy = copies.find((s) => s.type === 'arrow')!
    const rectCopies = copies.filter((s) => s.type === 'rect').map((s) => s.id)
    expect(rectCopies).toContain(arrowCopy.startId)
    expect(rectCopies).toContain(arrowCopy.endId)
    expect(arrowCopy.startId).not.toBe(a)

    // Copying the arrow alone leaves the copy free.
    editor.setTool('select')
    click(at(900, 900))
    click(at(200, 50))
    expect(editor.getState().selection).toEqual([arrow])
    editor.duplicateSelection()
    const lone = store.get(editor.getState().selection[0]!)!
    expect(lone.startId).toBeUndefined()
    expect(lone.endId).toBeUndefined()
  })
})

describe('access changes', () => {
  it('becomes view-only when edit access is withdrawn, and editable when granted', () => {
    const id = drawRect(0, 0, 100, 100)
    editor.startEditing(id)

    editor.setReadOnly(true)
    expect(editor.getState()).toMatchObject({
      readOnly: true,
      tool: 'hand',
      selection: [],
      editingId: null,
    })
    // Nothing can be changed any more.
    editor.setTool('rect')
    drag(at(200, 200), at(300, 300))
    editor.selectAll()
    editor.deleteSelection()
    expect(store.list()).toHaveLength(1)

    editor.setReadOnly(false)
    expect(editor.getState()).toMatchObject({ readOnly: false, tool: 'select' })
    drawRect(200, 200, 300, 300)
    expect(store.list()).toHaveLength(2)
  })
})
