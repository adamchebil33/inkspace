import type { Role } from '../../shared/boardKey'

/** A board this browser has opened. Kept in localStorage; there are no accounts. */
export interface RecentBoard {
  id: string
  /** The owner key or edit token this browser holds for the board, if any. */
  key: string | null
  /** What that key allowed the last time the board was open. */
  role: Role
  title: string
  openedAt: number
}

const STORAGE_KEY = 'inkspace:boards'
const MAX_BOARDS = 30
const ROLES: readonly string[] = ['owner', 'editor', 'viewer']

/** Accepts the current shape and the earlier one, which had only `editKey`. */
function parseBoard(value: unknown): RecentBoard | null {
  if (typeof value !== 'object' || value === null) return null
  const board = value as Record<string, unknown>
  if (typeof board.id !== 'string' || typeof board.title !== 'string') return null
  if (typeof board.openedAt !== 'number') return null

  const key = board.key ?? board.editKey ?? null
  if (key !== null && typeof key !== 'string') return null
  const role = ROLES.includes(board.role as string)
    ? (board.role as Role)
    : key
      ? 'editor'
      : 'viewer'
  return { id: board.id, key, role, title: board.title, openedAt: board.openedAt }
}

/** Most recently opened first. */
export function loadRecentBoards(): RecentBoard[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.map(parseBoard).filter((board): board is RecentBoard => board !== null)
  } catch {
    return []
  }
}

function save(boards: RecentBoard[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards.slice(0, MAX_BOARDS)))
    return true
  } catch {
    // Storage unavailable: the list just won't persist.
    return false
  }
}

/**
 * Add or refresh a board. Returns whether it was saved.
 *
 * An owner key is never replaced by anything lesser: it is the only copy of
 * the owner's access. Any other key is replaced by what is passed in, so an
 * edit link that has been revoked is forgotten.
 */
export function rememberBoard(board: Omit<RecentBoard, 'openedAt'>, now = Date.now()): boolean {
  const boards = loadRecentBoards()
  const existing = boards.find((b) => b.id === board.id)
  const keepOwner = existing?.role === 'owner' && board.role !== 'owner'
  const updated: RecentBoard = {
    ...board,
    key: keepOwner ? existing.key : board.key,
    role: keepOwner ? 'owner' : board.role,
    openedAt: now,
  }
  return save([updated, ...boards.filter((b) => b.id !== board.id)])
}

export function forgetBoard(id: string): void {
  save(loadRecentBoards().filter((b) => b.id !== id))
}

export const savedBoard = (id: string): RecentBoard | undefined =>
  loadRecentBoards().find((b) => b.id === id)

/** "just now", "5 minutes ago", "3 days ago", … */
export function timeAgo(then: number, now = Date.now()): string {
  const minutes = Math.floor((now - then) / 60_000)
  if (minutes < 1) return 'just now'
  const units: [number, string][] = [
    [60, 'minute'],
    [24, 'hour'],
    [30, 'day'],
    [12, 'month'],
    [Infinity, 'year'],
  ]
  let value = minutes
  for (const [size, name] of units) {
    if (value < size) return `${value} ${name}${value === 1 ? '' : 's'} ago`
    value = Math.floor(value / size)
  }
  return ''
}
