import { FONT_SIZE, fontFor, type FontStyle } from '../board/text'

let ctx: CanvasRenderingContext2D | null = null

/** Width of a string at the board's base font size, using an offscreen canvas. */
export function measureText(text: string, style: FontStyle = {}): number {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return 0
  ctx.font = fontFor(style, FONT_SIZE)
  return ctx.measureText(text).width
}
