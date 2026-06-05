import { describe, expect, it } from 'vitest'
import { wrapText } from './text'

// Pretend every character is 10 units wide.
const measure = (s: string) => s.length * 10

describe('wrapText', () => {
  it('wraps at word boundaries', () => {
    expect(wrapText('the quick brown fox', 100, measure)).toEqual(['the quick', 'brown fox'])
  })

  it('keeps explicit line breaks, including blank lines', () => {
    expect(wrapText('one\n\ntwo', 100, measure)).toEqual(['one', '', 'two'])
  })

  it('breaks a word that is wider than the box', () => {
    expect(wrapText('abcdefghij', 40, measure)).toEqual(['abcd', 'efgh', 'ij'])
  })

  it('returns one empty line for empty text', () => {
    expect(wrapText('', 100, measure)).toEqual([''])
  })
})
