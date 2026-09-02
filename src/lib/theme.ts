import { useSyncExternalStore } from 'react'

export type ThemeName = 'light' | 'dark'

const STORAGE_KEY = 'inkspace:theme'
const listeners = new Set<() => void>()

const systemQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function savedTheme(): ThemeName | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch {
    return null
  }
}

/** The theme in effect: the saved choice, or else what the system prefers. */
export function getTheme(): ThemeName {
  return savedTheme() ?? (systemQuery().matches ? 'dark' : 'light')
}

/**
 * The stylesheet keys off `data-theme` on <html>. (A small inline script in
 * index.html sets it before first paint, so there is no flash of the wrong
 * theme.) The canvas is told through `subscribeTheme`.
 */
function apply(): void {
  document.documentElement.dataset.theme = getTheme()
  for (const listener of listeners) listener()
}

export function setTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Without storage the choice lasts until the page reloads.
    document.documentElement.dataset.theme = theme
  }
  apply()
}

export function subscribeTheme(listener: () => void): () => void {
  if (listeners.size === 0) systemQuery().addEventListener('change', apply)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) systemQuery().removeEventListener('change', apply)
  }
}

export function useTheme(): ThemeName {
  return useSyncExternalStore(subscribeTheme, getTheme)
}
