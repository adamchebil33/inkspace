import * as Y from 'yjs'
import { loadUser } from '../lib/identity'
import { measureText } from '../lib/measure'
import { Editor } from './editor'
import { Follow } from './follow'
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
  /** Follow mode: keeping this view on what someone else is looking at. */
  follow: Follow
}

/**
 * Create the document, editor and (not yet connected) sync client for a
 * board. `key` is the owner key or edit token from the link, if any. Call
 * `sync.connect()` to go live.
 */
export function createBoardSession(boardId: string, key: string | null): BoardSession {
  const doc = new Y.Doc()
  // View-only until the server says otherwise. Whether a key still grants
  // edit access is the server's call (an edit link can be revoked), so the
  // client never decides that for itself.
  const editor = new Editor(new BoardStore(doc, { readOnly: true }), { measureText })

  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  // The key (an owner key or an edit token) proves what this connection may do.
  const query = key ? `?key=${encodeURIComponent(key)}` : ''
  const sync = new SyncClient(`${scheme}://${location.host}/api/ws/${boardId}${query}`, doc)

  sync.subscribe(() => {
    const access = sync.getAccess()
    if (access) editor.setReadOnly(access.role === 'viewer')
  })

  // Share our cursor, selection, view and any pen stroke in progress. Presence drops repeats and throttles the
  // cursor, so it is fine to call this on every editor change (including
  // pans and zooms, which move the world under a still pointer).
  const presence = new Presence(sync.awareness, loadUser())
  editor.subscribe(() => {
    presence.setDraft(editor.getDraft())
    presence.setCursor(editor.getPointerWorld())
    presence.setSelection(editor.getState().selection)
    presence.setView(editor.getViewRect())
  })

  // A board that already has content opens framed around it, rather than on
  // an empty patch of canvas (unless the user has already started moving).
  sync.onceSynced(() => {
    if (!editor.hasInteracted()) editor.zoomToFit()
  })

  return { editor, sync, presence, follow: new Follow(editor, presence) }
}
