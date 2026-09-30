import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetBoard, loadRecentBoards, rememberBoard, savedBoard, timeAgo } from './recentBoards'

beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  })
})

const editor = { id: 'a', key: 'token', role: 'editor', title: '' } as const

describe('recent boards', () => {
  it('lists the most recently opened board first, without duplicates', () => {
    rememberBoard({ ...editor, title: 'First' }, 1)
    rememberBoard({ id: 'b', key: null, role: 'viewer', title: 'Second' }, 2)
    rememberBoard({ ...editor, title: 'First, renamed' }, 3)

    expect(loadRecentBoards().map((b) => [b.id, b.title])).toEqual([
      ['a', 'First, renamed'],
      ['b', 'Second'],
    ])
  })

  it('never lets a lesser key replace the owner key', () => {
    rememberBoard({ id: 'a', key: 'owner-secret', role: 'owner', title: '' })
    // Later opened through an edit link, then a view link.
    rememberBoard(editor)
    rememberBoard({ id: 'a', key: null, role: 'viewer', title: '' })
    expect(savedBoard('a')).toMatchObject({ key: 'owner-secret', role: 'owner' })
  })

  it('forgets an edit link that no longer works', () => {
    rememberBoard(editor)
    rememberBoard({ id: 'a', key: null, role: 'viewer', title: '' })
    expect(savedBoard('a')).toMatchObject({ key: null, role: 'viewer' })
    expect(savedBoard('unknown')).toBeUndefined()
  })

  it('reads entries saved by the earlier format', () => {
    localStorage.setItem(
      'inkspace:boards',
      JSON.stringify([
        { id: 'old', editKey: 'k', title: 'Old', openedAt: 1 },
        { id: 'older', editKey: null, title: '', openedAt: 0 },
      ]),
    )
    expect(loadRecentBoards()).toMatchObject([
      { id: 'old', key: 'k', role: 'editor' },
      { id: 'older', key: null, role: 'viewer' },
    ])
  })

  it('forgets a board', () => {
    rememberBoard(editor)
    forgetBoard('a')
    expect(loadRecentBoards()).toEqual([])
  })

  it('reports whether saving worked', () => {
    expect(rememberBoard(editor)).toBe(true)
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(rememberBoard(editor)).toBe(false)
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
