import { describe, expect, it } from 'vitest'
import { boardIdFromPath, newBoardId } from './boardId'

describe('board ids', () => {
  it('reads the id from a board path', () => {
    expect(boardIdFromPath('/b/abc123_-XYZ')).toBe('abc123_-XYZ')
    expect(boardIdFromPath('/b/abc123_-XYZ/')).toBe('abc123_-XYZ')
  })

  it('rejects other paths and malformed ids', () => {
    expect(boardIdFromPath('/')).toBeNull()
    expect(boardIdFromPath('/b/short')).toBeNull()
    expect(boardIdFromPath('/b/has spaces in it')).toBeNull()
    expect(boardIdFromPath('/b/abcdefgh/extra')).toBeNull()
  })

  it('generates unique ids that are valid in a path', () => {
    const a = newBoardId()
    expect(a).not.toBe(newBoardId())
    expect(boardIdFromPath(`/b/${a}`)).toBe(a)
  })
})
