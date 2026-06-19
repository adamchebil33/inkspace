import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Editor, PointerInput } from '../board/editor'
import { CursorSmoother, type Presence } from '../board/presence'
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
export function BoardCanvas({ editor, presence }: { editor: Editor; presence: Presence }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const smoother = new CursorSmoother()
    let frame = 0

    // Any number of changes within a frame cause a single repaint.
    const schedule = () => {
      frame ||= requestAnimationFrame(draw)
    }
    const draw = (now: number) => {
      frame = 0
      const dpr = window.devicePixelRatio || 1
      const view = { width: canvas.clientWidth, height: canvas.clientHeight, dpr }
      const { peers, animating } = smoother.step(presence.getState().peers, now)
      const theme = darkQuery.matches ? DARK_THEME : LIGHT_THEME
      render(ctx, view, { ...editor.getRenderState(), peers }, theme)
      canvas.style.cursor = editor.getCursor()
      // Keep animating until every remote cursor has caught up.
      if (animating) schedule()
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
    const unsubscribePresence = presence.subscribe(schedule)
    darkQuery.addEventListener('change', schedule)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      unsubscribe()
      unsubscribePresence()
      darkQuery.removeEventListener('change', schedule)
    }
  }, [editor, presence])

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    editor.pointerDown(toInput(e.nativeEvent, e.currentTarget))
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    // Browsers merge fast pointer moves into one event per frame. While
    // drawing, replay the merged samples so quick strokes stay smooth.
    const events = editor.isDrawing() ? e.nativeEvent.getCoalescedEvents() : []
    for (const sample of events.length > 0 ? events : [e.nativeEvent]) {
      editor.pointerMove(toInput(sample, e.currentTarget))
    }
  }

  return (
    <canvas
      ref={ref}
      className="board-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => editor.pointerUp(toInput(e.nativeEvent, e.currentTarget))}
      onPointerCancel={(e) => editor.pointerUp(toInput(e.nativeEvent, e.currentTarget))}
      onPointerLeave={() => editor.pointerLeave()}
      onDoubleClick={(e) => editor.doubleClick(toInput(e.nativeEvent, e.currentTarget))}
      // Stops middle-click autoscroll and the context menu on the board.
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
