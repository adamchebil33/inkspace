import { FONT } from '../board/text'

let ctx: CanvasRenderingContext2D | null = null

/** Width of a string in the board's base font, using an offscreen canvas. */
export function measureText(text: string): number {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return 0
  ctx.font = FONT
  return ctx.measureText(text).width
}
