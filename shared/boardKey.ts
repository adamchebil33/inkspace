// Board access without accounts or a database of users. Used by the browser
// and the Worker, so it only relies on Web Crypto, which both have.
//
// Whoever creates a board generates a random secret, the owner key, which
// stays in their browser. Everything else is derived from it with one-way
// hashes:
//
//   owner key  --hash-->  edit token (generation 0)  --hash-->  board id
//
//   owner link:  /b/<boardId>#<owner key>    edit, and reset the edit link
//   edit link:   /b/<boardId>#<edit token>   edit
//   view link:   /b/<boardId>                watch only
//
// The server can check either secret against the board id by hashing, so it
// needs to store nothing for a new board. Going the other way is not
// possible: a view link cannot become an edit link, and an edit link cannot
// become an owner link.
//
// To revoke edit links the owner moves to the next generation. Edit tokens
// for later generations are also derived from the owner key, so the owner can
// always produce the current link; the board stores only the hash of the
// token that is valid now (see BoardRoom).

export const BOARD_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export type Role = 'owner' | 'editor' | 'viewer'

/** Who may edit a board right now. */
export interface EditAccess {
  /** How many times the edit link has been reset. */
  generation: number
  /** Hash of the edit token that is currently valid. */
  hash: string
}

const KEY_BYTES = 16
const HASH_BYTES = 16
const MAX_KEY_LENGTH = 128

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return toBase64Url(new Uint8Array(digest).subarray(0, HASH_BYTES))
}

/** A fresh random owner key (128 bits, URL-safe). */
export function newOwnerKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(KEY_BYTES)))
}

/** The edit token for a generation. Only the owner can compute this. */
export function editTokenFor(ownerKey: string, generation: number): Promise<string> {
  return hash(`inkspace:edit:${generation}:${ownerKey}`)
}

/** What the board stores to recognise an edit token. */
export const hashEditToken = (token: string): Promise<string> => hash(token)

/** The id of the board an owner key creates. */
export async function boardIdForOwner(ownerKey: string): Promise<string> {
  return hashEditToken(await editTokenFor(ownerKey, 0))
}

/** Before any reset, the valid edit token is the one that hashes to the id. */
export const initialEditAccess = (boardId: string): EditAccess => ({ generation: 0, hash: boardId })

/**
 * What a key allows on a board. `access` is the board's current edit access:
 * a board whose link was never reset uses `initialEditAccess`.
 */
export async function resolveRole(
  boardId: string,
  key: string | null,
  access: EditAccess,
): Promise<Role> {
  if (!key || key.length > MAX_KEY_LENGTH) return 'viewer'
  if ((await boardIdForOwner(key)) === boardId) return 'owner'
  if ((await hashEditToken(key)) === access.hash) return 'editor'
  return 'viewer'
}
