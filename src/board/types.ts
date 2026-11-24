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

/** Text sizes, in board units (the same as pixels at 100% zoom). */
export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 200

export const TEXT_ALIGNS = ['left', 'center', 'right'] as const

export type TextAlign = (typeof TEXT_ALIGNS)[number]

/** Shapes that hold text, and so can be formatted. */
export const hasText = (type: ShapeType): boolean => type === 'text' || isBoxType(type)

/**
 * Every shape has a bounding box (x, y, w, h), which is all that moving,
 * marquee selection and culling need. Type-specific data sits on top:
 *
 * - pen:   `points`, a polyline relative to (x, y). The box can be resized;
 *          the stroke is then scaled to fit it.
 * - arrow: runs between two opposite corners of the box; `flipX`/`flipY` say
 *          which corner it starts from. Either end can be attached to
 *          another shape (`startId`/`endId`).
 * - text:  the box is exactly the text block, and the font scales with it.
 *
 * Shapes that hold text (boxes and text) can also be formatted. Formatting
 * applies to the shape's whole text, and each property is stored separately,
 * so one person making a note bold while another types in it keeps both.
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
  /**
   * Arrow only: ids of the shapes its tail and head are attached to. An
   * attached end is not stored as a position; it is worked out from where
   * that shape is now, so the arrow follows the shape wherever it goes.
   */
  startId?: string
  endId?: string
  /**
   * Box shapes only: text size in board units, 16 when absent. (A text
   * shape's size is the scale of its box instead.)
   */
  fontSize?: number
  bold?: boolean
  italic?: boolean
  strike?: boolean
  /** Centred in boxes and left-aligned in text shapes when absent. */
  align?: TextAlign
}

export type Tool = 'select' | 'hand' | ShapeType
