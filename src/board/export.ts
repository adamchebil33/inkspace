import { unionRects, type Camera } from './geometry'
import { render } from './render'
import type { Theme } from './theme'
import type { Shape } from './types'

const PADDING = 48
/** Exported at 2x for sharp text, unless that would make a huge image. */
const PREFERRED_SCALE = 2
const MAX_SIDE = 8000

export interface ExportView {
  camera: Camera
  /** Image size in pixels. */
  width: number
  height: number
}

/** The camera and image size that frame every shape with some padding. */
export function exportView(shapes: readonly Shape[]): ExportView | null {
  const bounds = unionRects(shapes)
  if (!bounds) return null
  const w = bounds.w + PADDING * 2
  const h = bounds.h + PADDING * 2
  const zoom = Math.min(PREFERRED_SCALE, MAX_SIDE / w, MAX_SIDE / h)
  return {
    camera: { x: bounds.x - PADDING, y: bounds.y - PADDING, zoom },
    width: Math.ceil(w * zoom),
    height: Math.ceil(h * zoom),
  }
}

/**
 * Draw the whole board (not just what is on screen) to an offscreen canvas,
 * with the same renderer the live board uses, minus grid, selection and
 * cursors.
 */
export function renderBoardImage(shapes: readonly Shape[], theme: Theme): HTMLCanvasElement | null {
  const view = exportView(shapes)
  if (!view) return null

  const canvas = document.createElement('canvas')
  canvas.width = view.width
  canvas.height = view.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  render(
    ctx,
    { width: view.width, height: view.height, dpr: 1 },
    {
      shapes,
      camera: view.camera,
      selection: [],
      marquee: null,
      editingId: null,
      draft: null,
      peers: [],
      hideGrid: true,
    },
    theme,
  )
  return canvas
}

/** Save a canvas as a PNG file through the browser's download mechanism. */
export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

/** "Sprint planning!" -> "sprint-planning.png" */
export function exportFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'inkspace-board'}.png`
}
