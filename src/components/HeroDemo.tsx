import { useEffect, useRef } from 'react'
import type { Point } from '../board/geometry'
import type { Peer } from '../board/presence'
import { render } from '../board/render'
import { resolveShapes } from '../board/store'
import { LINE_HEIGHT } from '../board/text'
import { DARK_THEME, LIGHT_THEME } from '../board/theme'
import type { Shape } from '../board/types'
import { measureText } from '../lib/measure'
import { useTheme } from '../lib/theme'

/**
 * The home page's picture of a board in use: two people moving a note and
 * drawing, played on a loop. It is drawn by the board's own renderer from
 * made-up shapes and cursors, so it looks exactly like the real thing.
 */

const LOOP_SECONDS = 12
/** The part of the world the picture shows. */
const WORLD = { x: -30, y: -40, w: 790, h: 480 }

const ADA = { id: 1, name: 'Ada', color: '#7048e8' }
const GRACE = { id: 2, name: 'Grace', color: '#2f9e44' }

const NOTE_FROM = { x: 560, y: 250 }
const NOTE_TO = { x: 500, y: 60 }
const NOTE_SIZE = 150
/** Where Ada holds the note while dragging it, relative to its corner. */
const GRIP = { x: 80, y: 60 }

function baseShapes(): Shape[] {
  const titleScale = 1.5
  const title = 'Launch plan'
  const box = { color: 'yellow' as const, text: '', z: 0 }
  return [
    {
      ...box,
      id: 'title',
      type: 'text',
      color: 'gray',
      text: title,
      bold: true,
      x: 0,
      y: -20,
      w: measureText(title, { bold: true }) * titleScale,
      h: LINE_HEIGHT * titleScale,
    },
    {
      ...box,
      id: 'interview',
      type: 'sticky',
      text: 'Interview five users',
      x: 0,
      y: 60,
      w: NOTE_SIZE,
      h: NOTE_SIZE,
      z: 1,
    },
    {
      ...box,
      id: 'prototype',
      type: 'rect',
      color: 'blue',
      text: 'Prototype',
      fontSize: 24,
      x: 240,
      y: 90,
      w: 170,
      h: 90,
      z: 2,
    },
    {
      ...box,
      id: 'login',
      type: 'sticky',
      color: 'green',
      text: 'Fix the login bug',
      strike: true,
      x: 250,
      y: 270,
      w: 150,
      h: 110,
      z: 3,
    },
    {
      ...box,
      id: 'ship',
      type: 'sticky',
      color: 'pink',
      text: 'Ship it on Friday',
      bold: true,
      x: NOTE_FROM.x,
      y: NOTE_FROM.y,
      w: NOTE_SIZE,
      h: NOTE_SIZE,
      z: 4,
    },
    // Both arrows are attached, so they follow the note as it moves.
    { ...box, id: 'a1', type: 'arrow', color: 'gray', x: 0, y: 0, w: 1, h: 1, z: 5 },
    { ...box, id: 'a2', type: 'arrow', color: 'gray', x: 0, y: 0, w: 1, h: 1, z: 6 },
  ].map((shape) =>
    shape.id === 'a1'
      ? { ...shape, startId: 'interview', endId: 'prototype' }
      : shape.id === 'a2'
        ? { ...shape, startId: 'prototype', endId: 'ship' }
        : shape,
  ) as Shape[]
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/** Position along a path of [time, x, y] stops, easing between them. */
function along(stops: readonly (readonly [number, number, number])[], t: number): Point {
  const next = stops.findIndex(([time]) => time > t)
  if (next === -1) return { x: stops.at(-1)![1], y: stops.at(-1)![2] }
  if (next === 0) return { x: stops[0]![1], y: stops[0]![2] }
  const [t0, x0, y0] = stops[next - 1]!
  const [t1, x1, y1] = stops[next]!
  const k = ease((t - t0) / (t1 - t0))
  return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k }
}

const grip = (note: Point) => ({ x: note.x + GRIP.x, y: note.y + GRIP.y })
const at = (p: Point) => [p.x, p.y] as const

// Ada drags the pink note up into the plan, wanders off, then puts it back.
const NOTE_PATH = [
  [1.6, NOTE_FROM.x, NOTE_FROM.y],
  [3.4, NOTE_TO.x, NOTE_TO.y],
  [8.4, NOTE_TO.x, NOTE_TO.y],
  [10.2, NOTE_FROM.x, NOTE_FROM.y],
] as const
const ADA_PATH = [
  [0, 720, 20],
  [1.2, ...at(grip(NOTE_FROM))],
  [1.6, ...at(grip(NOTE_FROM))],
  [3.4, ...at(grip(NOTE_TO))],
  [4.2, ...at(grip(NOTE_TO))],
  [5.6, 690, 230],
  [7.2, 650, 40],
  [8.0, ...at(grip(NOTE_TO))],
  [8.4, ...at(grip(NOTE_TO))],
  [10.2, ...at(grip(NOTE_FROM))],
  [10.8, ...at(grip(NOTE_FROM))],
  [12, 720, 20],
] as const

// Grace circles "Prototype" with the pen, then deletes her circle again.
const LOOP_CENTRE = { x: 325, y: 135 }
const DRAW_START = 3.8
const DRAW_END = 5.8
const DELETE_AT = 9.8
function loopPoint(k: number): Point {
  const angle = -2.4 + k * Math.PI * 2.12
  return {
    x: LOOP_CENTRE.x + Math.cos(angle) * (118 + k * 8),
    y: LOOP_CENTRE.y + Math.sin(angle) * (68 + k * 6),
  }
}
const GRACE_PATH = [
  [0, 120, 420],
  [2.6, 160, 330],
  [DRAW_START, ...at(loopPoint(0))],
  [DRAW_END + 0.3, ...at(loopPoint(1))],
  [8.4, 90, 390],
  [9.3, ...at(loopPoint(0.6))],
  [DELETE_AT + 0.5, ...at(loopPoint(0.6))],
  [12, 120, 420],
] as const

function strokePoints(upTo: number): number[] {
  const points: number[] = []
  const steps = Math.max(2, Math.round(upTo * 60))
  for (let i = 0; i <= steps; i++) {
    const p = loopPoint((i / steps) * upTo)
    points.push(p.x, p.y)
  }
  return points
}

/** Everything on the board at `t` seconds into the loop. */
function frameAt(t: number, base: readonly Shape[]): { shapes: Shape[]; peers: Peer[] } {
  const note = along(NOTE_PATH, t)
  const shapes = base.map((s) => (s.id === 'ship' ? { ...s, ...note } : s))

  const drawing = t >= DRAW_START && t < DRAW_END
  const drawn = t >= DRAW_END && t < DELETE_AT
  if (drawn) {
    const points = strokePoints(1)
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (let i = 0; i < points.length; i += 2) {
      left = Math.min(left, points[i]!)
      right = Math.max(right, points[i]!)
      top = Math.min(top, points[i + 1]!)
      bottom = Math.max(bottom, points[i + 1]!)
    }
    shapes.push({
      id: 'circle',
      type: 'pen',
      color: 'red',
      text: '',
      z: 7,
      x: left,
      y: top,
      w: right - left,
      h: bottom - top,
      points: points.map((v, i) => v - (i % 2 === 0 ? left : top)),
    })
  }

  const wobble = (seed: number) => ({
    x: Math.sin(t * 2.1 + seed) * 2,
    y: Math.cos(t * 1.7 + seed) * 2,
  })
  const adaAt = along(ADA_PATH, t)
  const graceAt = along(GRACE_PATH, t)
  const adaHolding = (t >= 1.2 && t < 4.2) || (t >= 8.0 && t < 10.8)
  const peer = (who: typeof ADA, cursor: Point, selection: string[]): Peer => ({
    ...who,
    cursor,
    selection,
    draft: null,
    following: null,
    view: null,
  })

  return {
    shapes: resolveShapes(shapes),
    peers: [
      peer(ADA, adaHolding ? adaAt : add(adaAt, wobble(0)), adaHolding ? ['ship'] : []),
      {
        ...peer(
          GRACE,
          drawing ? graceAt : add(graceAt, wobble(2)),
          drawn && t >= 9.3 ? ['circle'] : [],
        ),
        draft: drawing
          ? { color: 'red', points: strokePoints((t - DRAW_START) / (DRAW_END - DRAW_START)) }
          : null,
      },
    ],
  }
}

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })

export function HeroDemo() {
  const ref = useRef<HTMLCanvasElement>(null)
  const theme = useTheme()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const base = baseShapes()
    const palette = theme === 'dark' ? DARK_THEME : LIGHT_THEME
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    const resize = () => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
    }

    const draw = (t: number) => {
      if (width === 0 || height === 0) return
      const zoom = Math.min(width / WORLD.w, height / WORLD.h)
      const { shapes, peers } = frameAt(t, base)
      render(
        ctx,
        { width, height, dpr: window.devicePixelRatio || 1 },
        {
          shapes,
          peers,
          camera: {
            zoom,
            x: WORLD.x + WORLD.w / 2 - width / 2 / zoom,
            y: WORLD.y + WORLD.h / 2 - height / 2 / zoom,
          },
          selection: [],
          marquee: null,
          editingId: null,
          draft: null,
        },
        palette,
      )
    }

    // Animate only while the picture is on screen; with reduced motion,
    // show one moment that tells the story: a note moved, a circle drawn.
    let frame = 0
    let visible = true
    const start = performance.now()
    const tick = (now: number) => {
      draw(((now - start) / 1000) % LOOP_SECONDS)
      if (visible && !still) frame = requestAnimationFrame(tick)
    }
    const redraw = () => {
      cancelAnimationFrame(frame)
      if (still) draw(7)
      else frame = requestAnimationFrame(tick)
    }

    const sizeObserver = new ResizeObserver(() => {
      resize()
      redraw()
    })
    sizeObserver.observe(canvas)
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true
      if (visible) redraw()
      else cancelAnimationFrame(frame)
    })
    visibility.observe(canvas)

    return () => {
      cancelAnimationFrame(frame)
      sizeObserver.disconnect()
      visibility.disconnect()
    }
  }, [theme])

  return (
    <canvas
      ref={ref}
      className="hero-canvas"
      role="img"
      aria-label="Two people, Ada and Grace, editing a board called Launch plan: one drags a sticky note into place while the other circles a box with the pen"
    />
  )
}
