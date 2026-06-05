export type ShapeType = 'rect' | 'ellipse' | 'sticky'

export const SHAPE_TYPES: readonly ShapeType[] = ['rect', 'ellipse', 'sticky']

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
}

export type Tool = 'select' | 'hand' | ShapeType
