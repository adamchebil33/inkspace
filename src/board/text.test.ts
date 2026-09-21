import { describe, expect, it } from 'vitest'
import { diffText, shiftCaret, wrapText } from './text'

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

describe('diffText', () => {
  it('finds the single edit between two strings', () => {
    expect(diffText('hello world', 'hello brave world')).toEqual({
      index: 6,
      remove: 0,
      insert: 'brave ',
    })
    expect(diffText('hello world', 'hello')).toEqual({ index: 5, remove: 6, insert: '' })
    expect(diffText('cat', 'cut')).toEqual({ index: 1, remove: 1, insert: 'u' })
    expect(diffText('', 'abc')).toEqual({ index: 0, remove: 0, insert: 'abc' })
    expect(diffText('same', 'same')).toBeNull()
  })

  it('handles repeated characters without overlapping the two ends', () => {
    // Appending "a" to "aa": start and end matches must not double count.
    const edit = diffText('aa', 'aaa')!
    expect(edit.remove).toBe(0)
    expect(edit.insert).toBe('a')
  })

  it('never splits an emoji', () => {
    // 😀 and 😃 share their first UTF-16 unit.
    const edit = diffText('a😀', 'a😃')!
    expect(edit).toEqual({ index: 1, remove: 2, insert: '😃' })
  })

  it('applying the edit reproduces the new text', () => {
    const cases: [string, string][] = [
      ['abcdef', 'abXYef'],
      ['line one\nline two', 'line one\nline 2'],
      ['aaaa', 'aa'],
      ['x', ''],
    ]
    for (const [before, after] of cases) {
      const { index, remove, insert } = diffText(before, after)!
      expect(before.slice(0, index) + insert + before.slice(index + remove)).toBe(after)
    }
  })
})

describe('shiftCaret', () => {
  const insertAtStart = { index: 0, remove: 0, insert: 'Hi ' }
  it('moves a caret that is after the edit', () => {
    expect(shiftCaret(5, insertAtStart)).toBe(8)
  })
  it('leaves a caret that is before the edit', () => {
    expect(shiftCaret(2, { index: 4, remove: 1, insert: '' })).toBe(2)
  })
  it('puts a caret that was inside a replaced range after the replacement', () => {
    expect(shiftCaret(3, { index: 1, remove: 4, insert: 'xy' })).toBe(3)
    expect(shiftCaret(4, { index: 1, remove: 4, insert: 'x' })).toBe(2)
  })
})
