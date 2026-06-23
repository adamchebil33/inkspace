/** A board this browser has opened. Kept in localStorage; there are no accounts. */
export interface RecentBoard {
  id: string
  /** Present if this browser can edit the board. */
  editKey: string | null
  title: string
  openedAt: number
}

const STORAGE_KEY = 'inkspace:boards'
const MAX_BOARDS = 30

function isRecentBoard(value: unknown): value is RecentBoard {
  if (typeof value !== 'object' || value === null) return false
  const board = value as Record<string, unknown>
  return (
    typeof board.id === 'string' &&
    (board.editKey === null || typeof board.editKey === 'string') &&
    typeof board.title === 'string' &&
    typeof board.openedAt === 'number'
  )
}

/** Most recently opened first. */
export function loadRecentBoards(): RecentBoard[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter(isRecentBoard) : []
  } catch {
    return []
  }
}

function save(boards: RecentBoard[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards.slice(0, MAX_BOARDS)))
  } catch {
    // Storage unavailable: the list just won't persist.
  }
}

/** Add or refresh a board. An edit key, once known, is never forgotten. */
export function rememberBoard(board: Omit<RecentBoard, 'openedAt'>, now = Date.now()): void {
  const boards = loadRecentBoards()
  const existing = boards.find((b) => b.id === board.id)
  const updated: RecentBoard = {
    ...board,
    editKey: board.editKey ?? existing?.editKey ?? null,
    openedAt: now,
  }
  save([updated, ...boards.filter((b) => b.id !== board.id)])
}

export function forgetBoard(id: string): void {
  save(loadRecentBoards().filter((b) => b.id !== id))
}

export const savedEditKey = (id: string): string | null =>
  loadRecentBoards().find((b) => b.id === id)?.editKey ?? null

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
