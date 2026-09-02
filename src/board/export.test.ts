import { describe, expect, it } from 'vitest'
import { exportFilename, exportView } from './export'
import type { Shape } from './types'

const box = (x: number, y: number, w: number, h: number): Shape => ({
  id: `${x},${y}`,
  type: 'rect',
  x,
  y,
  w,
  h,
  color: 'blue',
  text: '',
  z: 0,
})

describe('exportView', () => {
  it('frames all shapes with padding at double resolution', () => {
    const view = exportView([box(100, 50, 200, 100), box(400, 300, 100, 100)])
    expect(view).toEqual({
      camera: { x: 52, y: 2, zoom: 2 },
      width: (400 + 96) * 2,
      height: (350 + 96) * 2,
    })
  })

  it('lowers the resolution rather than produce an enormous image', () => {
    const view = exportView([box(0, 0, 20_000, 1000)])!
    expect(view.width).toBeLessThanOrEqual(8000)
    expect(view.camera.zoom).toBeLessThan(1)
  })

  it('has nothing to export for an empty board', () => {
    expect(exportView([])).toBeNull()
  })
})

describe('exportFilename', () => {
  it('makes a safe file name from the board title', () => {
    expect(exportFilename('Sprint planning: Q3!')).toBe('sprint-planning-q3.png')
    expect(exportFilename('')).toBe('inkspace-board.png')
    expect(exportFilename('../../etc')).toBe('etc.png')
  })
})
