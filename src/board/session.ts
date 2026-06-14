import * as Y from 'yjs'
import { loadUser } from '../lib/identity'
import { Editor } from './editor'
import { Presence } from './presence'
import { BoardStore } from './store'
import { SyncClient } from './sync-client'

/** Everything that belongs to one open board. */
export interface BoardSession {
  editor: Editor
  /** Syncs the document with the server and reconnects on its own. */
  sync: SyncClient
  /** Who else is here, and where their cursors are. */
  presence: Presence
}

/**
 * Create the document, editor and (not yet connected) sync client for a
 * board. Call `sync.connect()` to go live.
 */
export function createBoardSession(boardId: string): BoardSession {
  const doc = new Y.Doc()
  const editor = new Editor(new BoardStore(doc))

  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  const sync = new SyncClient(`${scheme}://${location.host}/api/ws/${boardId}`, doc)

  // Share our cursor and selection. Presence drops repeats and throttles the
  // cursor, so it is fine to call this on every editor change (including
  // pans and zooms, which move the world under a still pointer).
  const presence = new Presence(sync.awareness, loadUser())
  editor.subscribe(() => {
    presence.setCursor(editor.getPointerWorld())
    presence.setSelection(editor.getState().selection)
  })

  return { editor, sync, presence }
}
