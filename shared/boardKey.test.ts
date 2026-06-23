import { describe, expect, it } from 'vitest'
import { BOARD_ID_PATTERN, boardIdForKey, canEditBoard, newEditKey } from './boardKey'

describe('board keys', () => {
  it('derives a stable, URL-safe id from a key', async () => {
    const key = newEditKey()
    const id = await boardIdForKey(key)
    expect(id).toBe(await boardIdForKey(key))
    expect(id).toMatch(BOARD_ID_PATTERN)
    expect(id).not.toContain(key)
  })

  it('gives every key a different board', async () => {
    expect(newEditKey()).not.toBe(newEditKey())
    expect(await boardIdForKey('a')).not.toBe(await boardIdForKey('b'))
  })

  it('grants edit access only with the matching key', async () => {
    const key = newEditKey()
    const id = await boardIdForKey(key)
    expect(await canEditBoard(id, key)).toBe(true)
    expect(await canEditBoard(id, newEditKey())).toBe(false)
    expect(await canEditBoard(id, null)).toBe(false)
    expect(await canEditBoard(id, '')).toBe(false)
    // Knowing the id (a view link) is not enough.
    expect(await canEditBoard(id, id)).toBe(false)
  })
})
