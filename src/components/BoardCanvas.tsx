import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Editor, PointerInput } from '../board/editor'
import type { Follow } from '../board/follow'
import { CursorSmoother, type Presence } from '../board/presence'
import { render } from '../board/render'
import { DARK_THEME, LIGHT_THEME } from '../board/theme'
import { getTheme, subscribeTheme } from '../lib/theme'

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
interface Props {
  editor: Editor
  presence: Presence
  follow: Follow
}

export function BoardCanvas({ editor, presence, follow }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

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
      // In follow mode, first move our view toward the leader's.
      const catchingUp = follow.step(now)
      const { peers, animating } = smoother.step(presence.getState().peers, now)
      const theme = getTheme() === 'dark' ? DARK_THEME : LIGHT_THEME
      render(ctx, view, { ...editor.getRenderState(), peers }, theme)
      canvas.style.cursor = editor.getCursor()
      // Keep animating until every remote cursor, and our view, has caught up.
      if (animating || catchingUp) schedule()
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
    const unsubscribeTheme = subscribeTheme(schedule)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      unsubscribe()
      unsubscribePresence()
      unsubscribeTheme()
    }
  }, [editor, presence, follow])

  // Fingers currently on the screen, for two-finger pan and pinch zoom.
  const touches = useRef(new Map<number, { x: number; y: number }>())

  const pinchState = () => {
    const [a, b] = [...touches.current.values()]
    if (!a || !b) return null
    return {
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      spread: Math.hypot(a.x - b.x, a.y - b.y),
    }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const input = toInput(e.nativeEvent, e.currentTarget)
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, input)
      if (touches.current.size === 2) {
        // The first finger may have started drawing or dragging; drop that.
        editor.cancelGesture()
        return
      }
      if (touches.current.size > 2) return
    }
    editor.pointerDown(input)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' && touches.current.size >= 2) {
      const before = pinchState()
      touches.current.set(e.pointerId, toInput(e.nativeEvent, e.currentTarget))
      const after = pinchState()
      if (before && after && before.spread > 0) {
        editor.pinch(before.center, after.center, after.spread / before.spread)
      }
      return
    }
    // Browsers merge fast pointer moves into one event per frame. While
    // drawing, replay the merged samples so quick strokes stay smooth.
    const events = editor.isDrawing() ? e.nativeEvent.getCoalescedEvents() : []
    for (const sample of events.length > 0 ? events : [e.nativeEvent]) {
      editor.pointerMove(toInput(sample, e.currentTarget))
    }
  }

  const onPointerEnd = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const wasPinching = touches.current.size >= 2
    touches.current.delete(e.pointerId)
    // Lifting a finger after a pinch must not count as a click.
    if (!wasPinching) editor.pointerUp(toInput(e.nativeEvent, e.currentTarget))
  }

  return (
    <canvas
      ref={ref}
      className="board-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={() => editor.pointerLeave()}
      onDoubleClick={(e) => editor.doubleClick(toInput(e.nativeEvent, e.currentTarget))}
      // Stops middle-click autoscroll and the context menu on the board.
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
