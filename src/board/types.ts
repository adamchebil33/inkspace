export const SHAPE_TYPES = ['rect', 'ellipse', 'sticky', 'pen', 'arrow', 'text'] as const

export type ShapeType = (typeof SHAPE_TYPES)[number]

/** Shapes drawn as a filled box that can hold centred text. */
export type BoxType = 'rect' | 'ellipse' | 'sticky'

export const isBoxType = (type: string): type is BoxType =>
  type === 'rect' || type === 'ellipse' || type === 'sticky'

export const COLORS = [
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'blue',
  'green',
  'gray',
] as const

export type ColorName = (typeof COLORS)[number]

/**
 * Every shape has a bounding box (x, y, w, h), which is all that moving,
 * marquee selection and culling need. Type-specific data sits on top:
 *
 * - pen:   `points`, a polyline relative to (x, y). The box can be resized;
 *          the stroke is then scaled to fit it.
 * - arrow: runs between two opposite corners of the box; `flipX`/`flipY` say
 *          which corner it starts from.
 * - text:  the box is exactly the text block, and the font scales with it.
 */
export interface Shape {
  id: string
  type: ShapeType
  x: number
  y: number
  w: number
  h: number
  color: ColorName
  text: string
  /** Stacking order: higher draws on top. Ties are broken by id. */
  z: number
  /** Pen only: x0, y0, x1, y1, … relative to the shape's origin. */
  points?: readonly number[]
  /** Arrow only: starts at the right (flipX) / bottom (flipY) edge. */
  flipX?: boolean
  flipY?: boolean
}

export type Tool = 'select' | 'hand' | ShapeType
