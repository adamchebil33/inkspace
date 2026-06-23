// Board access without accounts or a database. Used by the browser and the
// Worker, so it only relies on Web Crypto, which both have.
//
// Whoever creates a board generates a random secret, the edit key. The board
// id is a hash of that key:
//
//   edit link:  /b/<boardId>#<editKey>   (can edit: proves it knows the key)
//   view link:  /b/<boardId>             (can only watch)
//
// The server recomputes the hash to decide whether a connection may write.
// The id reveals nothing about the key, so a view link cannot be upgraded,
// and the server never has to store who may edit what.

export const BOARD_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

const KEY_BYTES = 16
const ID_BYTES = 16

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

/** A fresh random edit key (128 bits, URL-safe). */
export function newEditKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(KEY_BYTES)))
}

/** The id of the board that `editKey` unlocks. */
export async function boardIdForKey(editKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(editKey))
  return toBase64Url(new Uint8Array(digest).subarray(0, ID_BYTES))
}

/** Does `editKey` grant edit access to `boardId`? */
export async function canEditBoard(boardId: string, editKey: string | null): Promise<boolean> {
  if (!editKey || editKey.length > 128) return false
  return (await boardIdForKey(editKey)) === boardId
}
