import { useEffect, useState, useSyncExternalStore } from 'react'
import { createBoardSession } from '../board/session'
import { BoardCanvas } from './BoardCanvas'
import { ConnectionStatus } from './ConnectionStatus'
import { PresenceBar } from './PresenceBar'
import { TextEditor } from './TextEditor'
import { Toolbar } from './Toolbar'
import { useShortcuts } from './useShortcuts'
import { ZoomControls } from './ZoomControls'

/** One board. Render with `key={boardId}` so a new id gets a fresh session. */
export function Board({ boardId }: { boardId: string }) {
  const [{ editor, sync, presence }] = useState(() => createBoardSession(boardId))
  const state = useSyncExternalStore(editor.subscribe, editor.getState)
  useShortcuts(editor)

  useEffect(() => {
    sync.connect()
    return () => sync.disconnect()
  }, [sync])

  // Exposed in development for console debugging and the end-to-end tests.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { editor, presence, sync })
  }, [editor, presence, sync])

  return (
    <div className="board">
      <BoardCanvas editor={editor} presence={presence} />
      <TextEditor editor={editor} state={state} />
      <ConnectionStatus sync={sync} />
      <PresenceBar editor={editor} presence={presence} />
      <Toolbar editor={editor} state={state} />
      <ZoomControls editor={editor} state={state} />
    </div>
  )
}
