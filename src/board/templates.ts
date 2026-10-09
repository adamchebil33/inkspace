import { arrowFromEnds, rectCenter } from './geometry'
import { resolveShapes, type BoardStore } from './store'
import { textBlockSize } from './text'
import type { ColorName, Shape, ShapeType } from './types'

// Starter boards offered on the home page. Each is plain shape data built in
// code, laid out around the world origin, so it needs no files and no server.

export const TEMPLATE_IDS = ['brainstorm', 'retro', 'kanban', 'flowchart'] as const

export type TemplateId = (typeof TEMPLATE_IDS)[number]

export interface TemplateInfo {
  id: TemplateId
  name: string
  description: string
  /** Board title the template sets. */
  title: string
}

export const TEMPLATES: readonly TemplateInfo[] = [
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    description: 'One idea in the middle, questions around it',
    title: 'Brainstorm',
  },
  {
    id: 'retro',
    name: 'Retrospective',
    description: 'What went well, what to improve, what to do next',
    title: 'Retrospective',
  },
  {
    id: 'kanban',
    name: 'Kanban',
    description: 'To do, doing and done',
    title: 'Kanban board',
  },
  {
    id: 'flowchart',
    name: 'Flowchart',
    description: 'Steps and a decision, joined by arrows',
    title: 'Flowchart',
  },
]

export const isTemplateId = (value: unknown): value is TemplateId =>
  TEMPLATE_IDS.includes(value as TemplateId)

type Measure = (text: string) => number

/** Collects shapes with fresh ids and increasing stacking order. */
class Builder {
  readonly shapes: Shape[] = []
  private z = 1
  private readonly measure: Measure

  constructor(measure: Measure) {
    this.measure = measure
  }

  add(type: ShapeType, x: number, y: number, w: number, h: number, color: ColorName, text = '') {
    const shape: Shape = { id: newId(), type, x, y, w, h, color, text, z: this.z++ }
    this.shapes.push(shape)
    return shape
  }

  sticky(x: number, y: number, color: ColorName, text: string) {
    return this.add('sticky', x, y, 190, 190, color, text)
  }

  /** Free text whose font is `scale` times the normal size. */
  text(x: number, y: number, text: string, scale = 1) {
    const size = textBlockSize(text, this.measure)
    return this.add('text', x, y, size.w * scale, size.h * scale, 'gray', text)
  }

  /** An arrow attached to both shapes, so it follows them when they move. */
  arrow(from: Shape, to: Shape) {
    const box = arrowFromEnds(rectCenter(from), rectCenter(to))
    this.shapes.push({
      id: newId(),
      type: 'arrow',
      ...box,
      color: 'gray',
      text: '',
      z: this.z++,
      startId: from.id,
      endId: to.id,
    })
  }
}

const newId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 16)

interface Column {
  title: string
  color: ColorName
  notes: string[]
}

/** Side-by-side columns: a heading, a background panel, and notes two abreast. */
function columns(b: Builder, specs: Column[]) {
  const width = 460
  const height = 720
  const gap = 40
  const left = -(specs.length * width + (specs.length - 1) * gap) / 2

  specs.forEach((spec, i) => {
    const x = left + i * (width + gap)
    const y = -height / 2
    b.add('rect', x, y, width, height, 'gray')
    b.text(x + 30, y + 30, spec.title, 1.75)
    spec.notes.forEach((note, n) => {
      b.sticky(x + 30 + (n % 2) * 210, y + 110 + Math.floor(n / 2) * 210, spec.color, note)
    })
  })
}

const BUILDERS: Record<TemplateId, (b: Builder) => void> = {
  brainstorm(b) {
    const idea = b.add('ellipse', -150, -95, 300, 190, 'purple', 'Main idea')
    const questions = [
      'Who is it for?',
      'What problem does it solve?',
      'What already exists?',
      'What would make it great?',
      'What could go wrong?',
      'What is the first step?',
    ]
    questions.forEach((question, i) => {
      const angle = (i / questions.length) * Math.PI * 2 - Math.PI / 2
      const note = b.sticky(
        Math.cos(angle) * 520 - 95,
        Math.sin(angle) * 360 - 95,
        'yellow',
        question,
      )
      b.arrow(idea, note)
    })
  },

  retro(b) {
    columns(b, [
      { title: 'Went well', color: 'green', notes: ['Shipped on time', 'Good pairing'] },
      { title: 'To improve', color: 'pink', notes: ['Too many meetings'] },
      { title: 'Next steps', color: 'blue', notes: ['Add a test for every bug fix'] },
    ])
  },

  kanban(b) {
    columns(b, [
      { title: 'To do', color: 'yellow', notes: ['Design the landing page', 'Write the README'] },
      { title: 'Doing', color: 'orange', notes: ['Build the sync server'] },
      { title: 'Done', color: 'green', notes: ['Set up the project'] },
    ])
  },

  flowchart(b) {
    const start = b.add('ellipse', -100, -470, 200, 100, 'green', 'Start')
    const work = b.add('rect', -120, -290, 240, 120, 'blue', 'Do the work')
    const check = b.add('rect', -120, -90, 240, 120, 'yellow', 'Is it right?')
    const done = b.add('ellipse', -100, 130, 200, 100, 'green', 'Done')
    const fix = b.add('rect', 260, -90, 220, 120, 'red', 'Fix it')
    b.arrow(start, work)
    b.arrow(work, check)
    b.arrow(check, done)
    b.arrow(check, fix)
    b.arrow(fix, work)
    b.text(16, 60, 'Yes')
    b.text(150, -62, 'No')
  },
}

/**
 * The shapes of a template, with fresh ids. `measure` gives the width of a
 * string at the base font size (for sizing text blocks).
 */
export function buildTemplate(id: TemplateId, measure: Measure): Shape[] {
  const builder = new Builder(measure)
  BUILDERS[id](builder)
  return resolveShapes(builder.shapes)
}

/**
 * Fill an empty board with a template and set its title. This is the
 * starting point, not something the user did, so it is not an undo step.
 */
export function applyTemplate(store: BoardStore, id: TemplateId, measure: Measure): void {
  const info = TEMPLATES.find((template) => template.id === id)!
  store.transact(() => {
    for (const shape of buildTemplate(id, measure)) store.add(shape)
    store.setTitle(info.title)
  })
  store.clearHistory()
}
