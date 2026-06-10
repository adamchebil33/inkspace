const BOARD_PATH = /^\/b\/([A-Za-z0-9_-]{8,64})\/?$/

/** The board id in a `/b/<id>` path, or null for any other path. */
export function boardIdFromPath(pathname: string): string | null {
  return BOARD_PATH.exec(pathname)?.[1] ?? null
}

/** A random, unguessable, URL-safe board id. */
export function newBoardId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
}
