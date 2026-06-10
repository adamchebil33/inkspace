import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { Editor } from './editor'
import { BoardStore } from './store'

/** Everything that belongs to one open board. */
export interface BoardSession {
  editor: Editor
  /** Syncs the document with the server and reconnects on its own. */
  provider: WebsocketProvider
}

/**
 * Create the document, editor and (not yet connected) sync provider for a
 * board. Call `provider.connect()` to go live.
 */
export function createBoardSession(boardId: string): BoardSession {
  const doc = new Y.Doc()
  const editor = new Editor(new BoardStore(doc))

  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  const provider = new WebsocketProvider(`${scheme}://${location.host}/api/ws`, boardId, doc, {
    connect: false,
    // Tabs in the same browser would otherwise also sync over a
    // BroadcastChannel; one path through the server is easier to reason about.
    disableBc: true,
  })

  return { editor, provider }
}
