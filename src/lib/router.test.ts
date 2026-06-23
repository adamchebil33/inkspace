import { describe, expect, it } from 'vitest'
import { boardPath, parseRoute } from './router'

describe('routes', () => {
  it('recognises the home page', () => {
    expect(parseRoute('/', '')).toEqual({ page: 'home' })
  })

  it('reads a view link and an edit link', () => {
    expect(parseRoute('/b/abc123_-XYZ', '')).toEqual({
      page: 'board',
      boardId: 'abc123_-XYZ',
      editKey: null,
    })
    expect(parseRoute('/b/abc123_-XYZ/', '#secret')).toMatchObject({ editKey: 'secret' })
  })

  it('rejects other paths and malformed ids', () => {
    expect(parseRoute('/nope', '')).toEqual({ page: 'not-found' })
    expect(parseRoute('/b/short', '')).toEqual({ page: 'not-found' })
    expect(parseRoute('/b/has spaces in it', '')).toEqual({ page: 'not-found' })
    expect(parseRoute('/b/abcdefgh/extra', '')).toEqual({ page: 'not-found' })
  })

  it('builds board paths', () => {
    expect(boardPath('abcdefgh')).toBe('/b/abcdefgh')
    expect(boardPath('abcdefgh', 'key')).toBe('/b/abcdefgh#key')
  })
})
