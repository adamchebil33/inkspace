import { describe, expect, it } from 'vitest'
import {
  BOARD_ID_PATTERN,
  boardIdForOwner,
  editTokenFor,
  hashEditToken,
  initialEditAccess,
  newOwnerKey,
  resolveRole,
} from './boardKey'

describe('board keys', () => {
  it('derives a stable, URL-safe id from an owner key', async () => {
    const owner = newOwnerKey()
    const id = await boardIdForOwner(owner)
    expect(id).toBe(await boardIdForOwner(owner))
    expect(id).toMatch(BOARD_ID_PATTERN)
    expect(newOwnerKey()).not.toBe(owner)
  })

  it('gives each kind of link its own secret', async () => {
    const owner = newOwnerKey()
    const id = await boardIdForOwner(owner)
    const token = await editTokenFor(owner, 0)
    expect(new Set([owner, token, id]).size).toBe(3)
    expect(await editTokenFor(owner, 1)).not.toBe(token)
  })
})

describe('resolveRole', () => {
  async function board() {
    const owner = newOwnerKey()
    const id = await boardIdForOwner(owner)
    return { owner, id, token: await editTokenFor(owner, 0), access: initialEditAccess(id) }
  }

  it('recognises the owner, an editor and a viewer on a new board', async () => {
    const { owner, id, token, access } = await board()
    expect(await resolveRole(id, owner, access)).toBe('owner')
    expect(await resolveRole(id, token, access)).toBe('editor')
    expect(await resolveRole(id, null, access)).toBe('viewer')
    expect(await resolveRole(id, '', access)).toBe('viewer')
    expect(await resolveRole(id, newOwnerKey(), access)).toBe('viewer')
  })

  it('cannot be climbed: neither the id nor an edit token grants more', async () => {
    const { id, token, access } = await board()
    // A view link (the id) is not an edit token, and an edit token is not an owner key.
    expect(await resolveRole(id, id, access)).toBe('viewer')
    expect(await resolveRole(id, token, access)).not.toBe('owner')
  })

  it('stops accepting the old edit token once the link is reset', async () => {
    const { owner, id, token } = await board()
    const next = await editTokenFor(owner, 1)
    const access = { generation: 1, hash: await hashEditToken(next) }

    expect(await resolveRole(id, token, access)).toBe('viewer')
    expect(await resolveRole(id, next, access)).toBe('editor')
    // The owner is unaffected by resets.
    expect(await resolveRole(id, owner, access)).toBe('owner')
  })

  it('rejects absurdly long keys without hashing them', async () => {
    const { id, access } = await board()
    expect(await resolveRole(id, 'x'.repeat(10_000), access)).toBe('viewer')
  })
})
