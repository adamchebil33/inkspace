import { useSyncExternalStore } from 'react'
import { BOARD_ID_PATTERN } from '../../shared/boardKey'

export type Route =
  | { page: 'home' }
  /** `key` (owner key or edit token) is the URL fragment, which is never sent to a server. */
  | { page: 'board'; boardId: string; key: string | null }
  | { page: 'not-found' }

export function parseRoute(pathname: string, hash: string): Route {
  if (pathname === '/') return { page: 'home' }
  const match = /^\/b\/([^/]+)\/?$/.exec(pathname)
  if (match && BOARD_ID_PATTERN.test(match[1]!)) {
    return { page: 'board', boardId: match[1]!, key: hash.replace(/^#/, '') || null }
  }
  return { page: 'not-found' }
}

export const boardPath = (boardId: string, key?: string | null) =>
  `/b/${boardId}${key ? `#${key}` : ''}`

const NAVIGATE_EVENT = 'inkspace:navigate'

/** Client-side navigation without a page load. `state` is readable as `history.state`. */
export function navigate(to: string, state: unknown = null): void {
  history.pushState(state, '', to)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

function subscribe(listener: () => void): () => void {
  const events = ['popstate', 'hashchange', NAVIGATE_EVENT]
  for (const event of events) window.addEventListener(event, listener)
  return () => {
    for (const event of events) window.removeEventListener(event, listener)
  }
}

const getLocation = () => `${location.pathname}${location.hash}`

/** The current route, re-rendering the caller whenever the URL changes. */
export function useRoute(): Route {
  useSyncExternalStore(subscribe, getLocation)
  return parseRoute(location.pathname, location.hash)
}
