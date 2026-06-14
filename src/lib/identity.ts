export interface UserInfo {
  name: string
  color: string
}

/** Saturated colours that read well as a cursor with white text on top. */
export const USER_COLORS = [
  '#e03131',
  '#d6336c',
  '#ae3ec9',
  '#7048e8',
  '#1c7ed6',
  '#0c8599',
  '#2f9e44',
  '#e8590c',
] as const

export const MAX_NAME_LENGTH = 24

const ADJECTIVES = ['Curious', 'Brave', 'Calm', 'Clever', 'Bright', 'Gentle', 'Swift', 'Bold']
const ANIMALS = ['Otter', 'Fox', 'Heron', 'Lynx', 'Panda', 'Falcon', 'Koala', 'Badger']

const STORAGE_KEY = 'inkspace:user'

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!

export function randomUser(): UserInfo {
  return { name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`, color: pick(USER_COLORS) }
}

export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH)
}

/** Up to two initials for an avatar, e.g. "Curious Otter" -> "CO". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? [words[0]![0], words[words.length - 1]![0]] : [words[0]?.[0]]
  return letters.join('').toUpperCase() || '?'
}

/** The saved identity, or a new random one. There are no accounts. */
export function loadUser(): UserInfo {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved && typeof saved === 'object') {
      const { name, color } = saved as Partial<UserInfo>
      if (typeof name === 'string' && cleanName(name) && USER_COLORS.includes(color as never)) {
        return { name: cleanName(name), color: color as string }
      }
    }
  } catch {
    // Storage blocked or corrupt: fall through to a fresh identity.
  }
  const user = randomUser()
  saveUser(user)
  return user
}

export function saveUser(user: UserInfo): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  } catch {
    // Private mode etc. The identity then just lasts for this visit.
  }
}
