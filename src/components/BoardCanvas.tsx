import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Editor, PointerInput } from '../board/editor'
import { render } from '../board/render'
import { DARK_THEME, LIGHT_THEME } from '../board/theme'

function toInput(e: PointerEvent | MouseEvent, canvas: HTMLCanvasElement): PointerInput {
  const rect = canvas.getBoundingClientRect()
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    button: e.button,
    shift: e.shiftKey,
  }
}

/** The drawing surface: forwards input to the editor and repaints on change. */
export function BoardCanvas({ editor }: { editor: Editor }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
    let frame = 0

    const draw = () => {
      frame = 0
      const dpr = window.devicePixelRatio || 1
      const view = {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        dpr,
      }
      render(ctx, view, editor.getRenderState(), darkQuery.matches ? DARK_THEME : LIGHT_THEME)
      canvas.style.cursor = editor.getCursor()
    }
    // Any number of changes within a frame cause a single repaint.
    const schedule = () => {
      frame ||= requestAnimationFrame(draw)
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
      editor.setViewport(canvas.clientWidth, canvas.clientHeight)
      schedule()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    // React's onWheel is passive, and we must preventDefault to stop the
    // browser zooming the whole page on pinch.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1
      editor.wheel({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        deltaX: e.deltaX * unit,
        deltaY: e.deltaY * unit,
        zoom: e.ctrlKey || e.metaKey,
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    const unsubscribe = editor.subscribe(schedule)
    darkQuery.addEventListener('change', schedule)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      unsubscribe()
      darkQuery.removeEventListener('change', schedule)
    }
  }, [editor])

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    editor.pointerDown(toInput(e.nativeEvent, e.currentTarget))
  }

  return (
    <canvas
      ref={ref}
      className="board-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={(e) => editor.pointerMove(toInput(e.nativeEvent, e.currentTarget))}
      onPointerUp={(e) => editor.pointerUp(toInput(e.nativeEvent, e.currentTarget))}
      onPointerCancel={(e) => editor.pointerUp(toInput(e.nativeEvent, e.currentTarget))}
      onDoubleClick={(e) => editor.doubleClick(toInput(e.nativeEvent, e.currentTarget))}
      // Stops middle-click autoscroll and the context menu on the board.
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
