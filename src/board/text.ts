import type { Shape } from './types'

export const FONT_SIZE = 16
export const LINE_HEIGHT = 21
export const TEXT_PADDING = 12
export const FONT_FAMILY = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
export const FONT = `${FONT_SIZE}px ${FONT_FAMILY}`

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
