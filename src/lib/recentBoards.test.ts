import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetBoard, loadRecentBoards, rememberBoard, savedEditKey, timeAgo } from './recentBoards'

beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  })
})

describe('recent boards', () => {
  it('lists the most recently opened board first, without duplicates', () => {
    rememberBoard({ id: 'a', editKey: 'ka', title: 'First' }, 1)
    rememberBoard({ id: 'b', editKey: null, title: 'Second' }, 2)
    rememberBoard({ id: 'a', editKey: 'ka', title: 'First, renamed' }, 3)

    expect(loadRecentBoards().map((b) => [b.id, b.title])).toEqual([
      ['a', 'First, renamed'],
      ['b', 'Second'],
    ])
  })

  it('keeps the edit key when the board is later opened from a view link', () => {
    rememberBoard({ id: 'a', editKey: 'secret', title: '' })
    rememberBoard({ id: 'a', editKey: null, title: '' })
    expect(savedEditKey('a')).toBe('secret')
    expect(savedEditKey('unknown')).toBeNull()
  })

  it('forgets a board', () => {
    rememberBoard({ id: 'a', editKey: null, title: '' })
    forgetBoard('a')
    expect(loadRecentBoards()).toEqual([])
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('inkspace:boards', '{not json')
    expect(loadRecentBoards()).toEqual([])
    localStorage.setItem('inkspace:boards', JSON.stringify([{ id: 5 }, null]))
    expect(loadRecentBoards()).toEqual([])
  })
})

describe('timeAgo', () => {
  const minute = 60_000
  it('describes how long ago something happened', () => {
    expect(timeAgo(0, 30_000)).toBe('just now')
    expect(timeAgo(0, minute)).toBe('1 minute ago')
    expect(timeAgo(0, 59 * minute)).toBe('59 minutes ago')
    expect(timeAgo(0, 3 * 60 * minute)).toBe('3 hours ago')
    expect(timeAgo(0, 2 * 24 * 60 * minute)).toBe('2 days ago')
    expect(timeAgo(0, 400 * 24 * 60 * minute)).toBe('1 year ago')
  })
})
