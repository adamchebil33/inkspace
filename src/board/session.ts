import * as Y from 'yjs'
import { loadUser } from '../lib/identity'
import { measureText } from '../lib/measure'
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
 * board. Without an edit key the board is view-only. Call `sync.connect()`
 * to go live.
 */
export function createBoardSession(boardId: string, editKey: string | null): BoardSession {
  const doc = new Y.Doc()
  const editor = new Editor(new BoardStore(doc, { readOnly: !editKey }), { measureText })

  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  // The edit key proves to the server that this connection may write.
  const query = editKey ? `?key=${encodeURIComponent(editKey)}` : ''
  const sync = new SyncClient(`${scheme}://${location.host}/api/ws/${boardId}${query}`, doc)

  // Share our cursor, selection and any pen stroke in progress. Presence drops repeats and throttles the
  // cursor, so it is fine to call this on every editor change (including
  // pans and zooms, which move the world under a still pointer).
  const presence = new Presence(sync.awareness, loadUser())
  editor.subscribe(() => {
    presence.setDraft(editor.getDraft())
    presence.setCursor(editor.getPointerWorld())
    presence.setSelection(editor.getState().selection)
  })

  // A board that already has content opens framed around it, rather than on
  // an empty patch of canvas (unless the user has already started moving).
  sync.onceSynced(() => {
    if (!editor.hasInteracted()) editor.zoomToFit()
  })

  return { editor, sync, presence }
}
