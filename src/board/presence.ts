import type { Awareness } from 'y-protocols/awareness'
import { MAX_NAME_LENGTH, type UserInfo } from '../lib/identity'
import { simplifyPoints, type Point, type Rect } from './geometry'
import { COLORS, type ColorName } from './types'

/** Someone else on the board, as read from their shared presence state. */
export interface Peer {
  id: number
  name: string
  color: string
  /** World position of their pointer, or null when it is off the board. */
  cursor: Point | null
  selection: readonly string[]
  /** The pen stroke they are drawing right now, before it is saved. */
  draft: Draft | null
  /** Id of the person whose view they are following, if any. */
  following: number | null
  /** The part of the board they can see. Only shared while someone follows them. */
  view: Rect | null
}

/** A pen stroke in progress, as flat x, y pairs in world coordinates. */
export interface Draft {
  color: ColorName
  points: readonly number[]
}

export interface PresenceState {
  /** This client's own presence id. */
  selfId: number
  user: UserInfo
  peers: readonly Peer[]
  /** Id of the person this client is following, if any. */
  following: number | null
}

/** Cursor positions are sent at most this often (20 per second). */
export const CURSOR_INTERVAL_MS = 50

const COLOR = /^#[0-9a-f]{6}$/i
const MAX_SELECTION = 200
/** Longer strokes are simplified before sharing, to keep messages small. */
const MAX_DRAFT_VALUES = 800

function parseDraft(value: unknown): Draft | null {
  if (typeof value !== 'object' || value === null) return null
  const { color, points } = value as Record<string, unknown>
  if (!COLORS.includes(color as ColorName) || !Array.isArray(points)) return null
  if (points.length < 2 || points.length % 2 !== 0 || points.length > MAX_DRAFT_VALUES * 4) {
    return null
  }
  if (!points.every((v) => typeof v === 'number' && Number.isFinite(v))) return null
  return { color: color as ColorName, points: points as number[] }
}

function parseView(value: unknown): Rect | null {
  if (typeof value !== 'object' || value === null) return null
  const { x, y, w, h } = value as Record<string, unknown>
  const numbers = [x, y, w, h].every((v) => typeof v === 'number' && Number.isFinite(v))
  if (!numbers || (w as number) <= 0 || (h as number) <= 0) return null
  return { x: x as number, y: y as number, w: w as number, h: h as number }
}

const isPoint = (v: unknown): v is Point =>
  typeof v === 'object' &&
  v !== null &&
  Number.isFinite((v as Point).x) &&
  Number.isFinite((v as Point).y)

/** Presence is written by other clients, so validate it like any input. */
export function parsePeer(id: number, state: unknown): Peer | null {
  if (typeof state !== 'object' || state === null) return null
  const { user, cursor, selection, draft, following, view } = state as Record<string, unknown>
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
    draft: parseDraft(draft),
    following: Number.isInteger(following) ? (following as number) : null,
    view: parseView(view),
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
  private draft: Draft | null = null
  private sentDraftLength = 0
  private view: Rect | null = null
  private sentView: Rect | null = null
  /** Is anyone following this client? Our view is only worth sending if so. */
  private followed = false

  constructor(awareness: Awareness, user: UserInfo) {
    this.awareness = awareness
    this.state = { selfId: awareness.clientID, user, peers: this.readPeers(), following: null }
    awareness.setLocalState({
      user,
      cursor: null,
      selection: [],
      draft: null,
      following: null,
      view: null,
    })
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
    const peers = this.readPeers()
    // Stop following someone who has left.
    const following = peers.some((p) => p.id === this.state.following) ? this.state.following : null
    this.state = { ...this.state, peers, following }
    if (following === null) this.shareFollowing(null)

    // Start or stop sharing our view as people follow or unfollow us.
    const followed = peers.some((p) => p.following === this.awareness.clientID)
    if (followed !== this.followed) {
      this.followed = followed
      this.setCursor(this.cursor)
    }
    for (const listener of this.listeners) listener()
  }

  /** Follow someone's view, or stop with null. */
  setFollowing(id: number | null): void {
    if (id === this.state.following) return
    this.state = { ...this.state, following: id }
    this.shareFollowing(id)
    for (const listener of this.listeners) listener()
  }

  private shareFollowing(id: number | null): void {
    const current = this.awareness.getLocalState() as { following?: number | null } | null
    if (current && (current.following ?? null) !== id) {
      this.awareness.setLocalStateField('following', id)
    }
  }

  /** The part of the board on this client's screen, for anyone following it. */
  setView(view: Rect): void {
    this.view = view
    if (this.followed) this.setCursor(this.cursor)
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

  /** Share the stroke being drawn. Sent together with the cursor. */
  setDraft(draft: Draft | null): void {
    this.draft = draft
    if (!draft && this.sentDraftLength > 0) this.flush()
  }

  /**
   * Share the pointer position. The first move goes out at once; after that
   * at most one update per interval, always ending on the latest position.
   * The pen stroke in progress and our view travel on the same schedule.
   */
  setCursor(cursor: Point | null): void {
    this.cursor = cursor
    if (this.cursorTimer) return
    this.flush()
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null
      if (Object.keys(this.pendingChanges()).length > 0) this.setCursor(this.cursor)
    }, CURSOR_INTERVAL_MS)
  }

  /** The fast-changing fields that differ from what was last sent. */
  private pendingChanges(): Record<string, unknown> {
    const changes: Record<string, unknown> = {}

    if (!samePoint(this.cursor, this.sentCursor)) {
      // One decimal place is plenty and keeps the messages small.
      changes.cursor = this.cursor && { x: round1(this.cursor.x), y: round1(this.cursor.y) }
    }

    const draftLength = this.draft?.points.length ?? 0
    if (draftLength !== this.sentDraftLength) {
      const points = this.draft?.points ?? []
      const compact = draftLength > MAX_DRAFT_VALUES ? simplifyPoints(points, 2) : points
      changes.draft = this.draft && { color: this.draft.color, points: compact.map(Math.round) }
    }

    const view = this.followed ? this.view : null
    if (!sameRect(view, this.sentView)) {
      changes.view = view && {
        x: round1(view.x),
        y: round1(view.y),
        w: round1(view.w),
        h: round1(view.h),
      }
    }
    return changes
  }

  /** Send everything that changed as a single presence update. */
  private flush(): void {
    const changes = this.pendingChanges()
    if (Object.keys(changes).length === 0) return
    this.sentCursor = this.cursor
    this.sentDraftLength = this.draft?.points.length ?? 0
    this.sentView = this.followed ? this.view : null
    this.awareness.setLocalState({ ...this.awareness.getLocalState(), ...changes })
  }
}

const round1 = (value: number) => Math.round(value * 10) / 10

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)

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
