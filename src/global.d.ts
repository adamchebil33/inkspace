import type { Editor } from './board/editor'
import type { Presence } from './board/presence'
import type { SyncClient } from './board/sync-client'

declare global {
  interface Window {
    /** Development only: the current board's session objects. */
    editor?: Editor
    presence?: Presence
    sync?: SyncClient
  }
}
