import type { ColorName } from './types'

export interface Theme {
  background: string
  gridDot: string
  accent: string
  marqueeFill: string
  handleFill: string
}

export const LIGHT_THEME: Theme = {
  background: '#f7f7f5',
  gridDot: '#d4d4cf',
  accent: '#4f46e5',
  marqueeFill: 'rgba(79, 70, 229, 0.08)',
  handleFill: '#ffffff',
}

export const DARK_THEME: Theme = {
  background: '#161618',
  gridDot: '#34343a',
  accent: '#818cf8',
  marqueeFill: 'rgba(129, 140, 248, 0.12)',
  handleFill: '#161618',
}

/** Shapes keep the same colours in both themes, like paper on a dark desk. */
export const PALETTE: Record<ColorName, { fill: string; stroke: string }> = {
  yellow: { fill: '#ffe066', stroke: '#e0b400' },
  orange: { fill: '#ffc078', stroke: '#e8720c' },
  red: { fill: '#ffa8a8', stroke: '#e03131' },
  pink: { fill: '#fcc2d7', stroke: '#d6336c' },
  purple: { fill: '#d0bfff', stroke: '#7048e8' },
  blue: { fill: '#a5d8ff', stroke: '#1c7ed6' },
  green: { fill: '#b2f2bb', stroke: '#2f9e44' },
  gray: { fill: '#e9ecef', stroke: '#868e96' },
}

export const SHAPE_TEXT_COLOR = '#1c1c1a'
