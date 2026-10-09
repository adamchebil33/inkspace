import { useEffect, useRef } from 'react'
import { unionRects } from '../board/geometry'
import { render } from '../board/render'
import { buildTemplate, type TemplateId } from '../board/templates'
import { DARK_THEME, LIGHT_THEME } from '../board/theme'
import { measureText } from '../lib/measure'
import { useTheme } from '../lib/theme'

const PADDING = 14

/** A small picture of a template, drawn by the same renderer as the board. */
export function TemplatePreview({ id }: { id: TemplateId }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const theme = useTheme()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)

    const shapes = buildTemplate(id, measureText)
    const bounds = unionRects(shapes)
    if (!bounds) return
    const zoom = Math.min((width - PADDING * 2) / bounds.w, (height - PADDING * 2) / bounds.h)
    const camera = {
      zoom,
      x: bounds.x + bounds.w / 2 - width / 2 / zoom,
      y: bounds.y + bounds.h / 2 - height / 2 / zoom,
    }
    render(
      ctx,
      { width, height, dpr },
      {
        shapes,
        camera,
        selection: [],
        marquee: null,
        editingId: null,
        draft: null,
        peers: [],
        hideGrid: true,
      },
      theme === 'dark' ? DARK_THEME : LIGHT_THEME,
    )
  }, [id, theme])

  return <canvas ref={ref} className="template-preview" aria-hidden="true" />
}
