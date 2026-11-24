import { MAX_FONT_SIZE, MIN_FONT_SIZE, type Shape, type ShapeType, type TextAlign } from './types'

export const FONT_SIZE = 16
export const LINE_HEIGHT = 21
export const TEXT_PADDING = 12
export const FONT_FAMILY = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
export const FONT = `${FONT_SIZE}px ${FONT_FAMILY}`

/** A text size brought into the allowed range, to a tenth of a unit. */
export const clampFontSize = (size: number): number =>
  Math.round(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size)) * 10) / 10

/** The parts of a shape's formatting that change how wide its text is. */
export interface FontStyle {
  bold?: boolean
  italic?: boolean
}

/**
 * Width of a string at the base font size, in the given style. Injected
 * wherever text is laid out, so the editor and its tests need no DOM.
 */
export type Measure = (text: string, style?: FontStyle) => number

/** A canvas or CSS font string. (Only CSS uses the line height.) */
export function fontFor(style: FontStyle, size: number, lineHeight?: number): string {
  const height = lineHeight === undefined ? '' : `/${lineHeight}px`
  return `${style.italic ? 'italic ' : ''}${style.bold ? 700 : 400} ${size}px${height} ${FONT_FAMILY}`
}

/** How big a box shape's text is, relative to the base font. */
export const boxTextScale = (shape: Pick<Shape, 'fontSize'>): number =>
  (shape.fontSize ?? FONT_SIZE) / FONT_SIZE

/** The text size a shape shows: its own for a box, from its scale for a text shape. */
export const fontSizeOf = (shape: Shape): number =>
  shape.type === 'text'
    ? Math.round(FONT_SIZE * textScale(shape) * 10) / 10
    : (shape.fontSize ?? FONT_SIZE)

export const textAlignOf = (shape: Pick<Shape, 'type' | 'align'>): TextAlign =>
  shape.align ?? defaultAlign(shape.type)

export const defaultAlign = (type: ShapeType): TextAlign => (type === 'text' ? 'left' : 'center')

/** The lines of a box shape's text, wrapped to fit inside it. */
export function boxTextLines(shape: Shape, measure: Measure): string[] {
  const scale = boxTextScale(shape)
  return wrapText(shape.text, textWidth(shape), (s) => measure(s, shape) * scale)
}

/** Width available for text inside a shape, in world units. */
export function textWidth(shape: Pick<Shape, 'type' | 'w'>): number {
  const inner = shape.type === 'ellipse' ? shape.w * 0.72 : shape.w
  return Math.max(0, inner - TEXT_PADDING * 2)
}

/**
 * Greedy word wrap. `measure` returns the rendered width of a string, so the
 * same function serves the canvas renderer and the unit tests.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = []

  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word
      if (measure(candidate) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      line = word
      // A single word wider than the box is broken across lines.
      while (line.length > 1 && measure(line) > maxWidth) {
        let cut = line.length - 1
        while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--
        lines.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    lines.push(line)
  }

  return lines
}

/** Natural size of a free text block: no wrapping, only explicit line breaks. */
export function textBlockSize(
  text: string,
  measure: (s: string) => number,
): { w: number; h: number } {
  const lines = text.split('\n')
  const widest = Math.max(...lines.map(measure))
  return { w: Math.max(widest, FONT_SIZE / 2), h: lines.length * LINE_HEIGHT }
}

/** How much a text shape's font is scaled, from the height of its box. */
export function textScale(shape: Pick<Shape, 'text' | 'h'>): number {
  return shape.h / (shape.text.split('\n').length * LINE_HEIGHT)
}

/** One contiguous edit: at `index`, `remove` characters were replaced by `insert`. */
export interface TextEdit {
  index: number
  remove: number
  insert: string
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff

/**
 * The smallest single edit that turns `before` into `after`: whatever lies
 * between their common start and common end. Typing, deleting and pasting in
 * a text field are always one such edit, which is what lets two people's
 * changes to the same text be merged instead of one replacing the other.
 */
export function diffText(before: string, after: string): TextEdit | null {
  if (before === after) return null
  const max = Math.min(before.length, after.length)

  let start = 0
  while (start < max && before[start] === after[start]) start++
  // Never cut an emoji (a surrogate pair) in half.
  if (start > 0 && isHighSurrogate(before.charCodeAt(start - 1))) start--

  let end = 0
  while (end < max - start && before[before.length - 1 - end] === after[after.length - 1 - end]) {
    end++
  }
  if (end > 0 && isLowSurrogate(before.charCodeAt(before.length - end))) end--

  return {
    index: start,
    remove: before.length - start - end,
    insert: after.slice(start, after.length - end),
  }
}

/** Where a caret at `position` ends up after `edit` is applied to the text. */
export function shiftCaret(position: number, edit: TextEdit): number {
  if (position <= edit.index) return position
  if (position >= edit.index + edit.remove) return position + edit.insert.length - edit.remove
  // The caret was inside the replaced part: put it after the replacement.
  return edit.index + edit.insert.length
}
