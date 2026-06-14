import type { Awareness } from 'y-protocols/awareness'
import { MAX_NAME_LENGTH, type UserInfo } from '../lib/identity'
import type { Point } from './geometry'

/** Someone else on the board, as read from their shared presence state. */
export interface Peer {
  id: number
  name: string
  color: string
  /** World position of their pointer, or null when it is off the board. */
  cursor: Point | null
  selection: readonly string[]
}

export interface PresenceState {
  user: UserInfo
  peers: readonly Peer[]
}

/** Cursor positions are sent at most this often (20 per second). */
export const CURSOR_INTERVAL_MS = 50

const COLOR = /^#[0-9a-f]{6}$/i
const MAX_SELECTION = 200

const isPoint = (v: unknown): v is Point =>
  typeof v === 'object' &&
  v !== null &&
  Number.isFinite((v as Point).x) &&
  Number.isFinite((v as Point).y)

/** Presence is written by other clients, so validate it like any input. */
export function parsePeer(id: number, state: unknown): Peer | null {
  if (typeof state !== 'object' || state === null) return null
  const { user, cursor, selection } = state as Record<string, unknown>
  if (typeof user !== 'object' || user === null) return null
  const { name, color } = user as Record<string, unknown>
  if (typeof name !== 'string' || typeof color !== 'string' || !COLOR.test(color)) return null

  return {
    id,
    name: name.slice(0, MAX_NAME_LENGTH) || 'Anonymous',
    color,
    cursor: isPoint(cursor) ? { x: cursor.x, y: cursor.y } : null,
    selection: Array.isArray(selection)
      ? selection.filter((s): s is string => typeof s === 'string').slice(0, MAX_SELECTION)
      : [],
  }
}

/**
 * Who is on the board and where their cursors are. A thin, typed layer over
 * Yjs awareness: short-lived state that is shared but never saved.
 */
export class Presence {
  private readonly awareness: Awareness
  private state: PresenceState
  private readonly listeners = new Set<() => void>()

  private cursor: Point | null = null
  private sentCursor: Point | null = null
  private cursorTimer: ReturnType<typeof setTimeout> | null = null
  private selectionKey = ''

  constructor(awareness: Awareness, user: UserInfo) {
    this.awareness = awareness
    this.state = { user, peers: this.readPeers() }
    awareness.setLocalState({ user, cursor: null, selection: [] })
    awareness.on('change', this.handleChange)
  }

  destroy(): void {
    this.awareness.off('change', this.handleChange)
    if (this.cursorTimer) clearTimeout(this.cursorTimer)
    this.listeners.clear()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = (): PresenceState => this.state

  private readPeers(): Peer[] {
    const peers: Peer[] = []
    this.awareness.getStates().forEach((state, id) => {
      if (id === this.awareness.clientID) return
      const peer = parsePeer(id, state)
      if (peer) peers.push(peer)
    })
    return peers.sort((a, b) => a.id - b.id)
  }

  private handleChange = (): void => {
    this.state = { ...this.state, peers: this.readPeers() }
    for (const listener of this.listeners) listener()
  }

  setUser(user: UserInfo): void {
    this.state = { ...this.state, user }
    this.awareness.setLocalStateField('user', user)
    for (const listener of this.listeners) listener()
  }

  setSelection(selection: readonly string[]): void {
    const key = selection.join(',')
    if (key === this.selectionKey) return
    this.selectionKey = key
    this.awareness.setLocalStateField('selection', selection.slice(0, MAX_SELECTION))
  }

  /**
   * Share the pointer position. The first move goes out at once; after that
   * at most one update per interval, always ending on the latest position.
   */
  setCursor(cursor: Point | null): void {
    this.cursor = cursor
    if (this.cursorTimer) return
    this.sendCursor()
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null
      if (!samePoint(this.cursor, this.sentCursor)) this.setCursor(this.cursor)
    }, CURSOR_INTERVAL_MS)
  }

  private sendCursor(): void {
    if (samePoint(this.cursor, this.sentCursor)) return
    this.sentCursor = this.cursor
    // One decimal place is plenty and keeps the messages small.
    const rounded = this.cursor && {
      x: Math.round(this.cursor.x * 10) / 10,
      y: Math.round(this.cursor.y * 10) / 10,
    }
    this.awareness.setLocalStateField('cursor', rounded)
  }
}

const samePoint = (a: Point | null, b: Point | null) =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y)

/** Time for a displayed cursor to cover ~63% of the gap to its target. */
const SMOOTHING_MS = 45

/**
 * Remote cursors arrive 20 times a second; drawing them raw looks jerky.
 * This eases each displayed cursor toward its latest known position.
 */
export class CursorSmoother {
  private readonly shown = new Map<number, Point>()
  private lastTime = 0

  /** Returns peers with eased cursors, and whether any is still moving. */
  step(peers: readonly Peer[], now: number): { peers: Peer[]; animating: boolean } {
    const dt = Math.min(100, now - this.lastTime)
    this.lastTime = now
    const blend = 1 - Math.exp(-dt / SMOOTHING_MS)
    let animating = false

    const seen = new Set<number>()
    const eased = peers.map((peer) => {
      if (!peer.cursor) return peer
      seen.add(peer.id)
      const current = this.shown.get(peer.id)
      const dx = current ? peer.cursor.x - current.x : 0
      const dy = current ? peer.cursor.y - current.y : 0
      // Snap when first seen or close enough that easing is invisible.
      if (!current || Math.hypot(dx, dy) < 0.1) {
        this.shown.set(peer.id, peer.cursor)
        return peer
      }
      const next = { x: current.x + dx * blend, y: current.y + dy * blend }
      this.shown.set(peer.id, next)
      animating = true
      return { ...peer, cursor: next }
    })

    for (const id of this.shown.keys()) if (!seen.has(id)) this.shown.delete(id)
    return { peers: eased, animating }
  }
}
