import { useEffect, useState, useSyncExternalStore } from 'react'
import { createBoardSession } from '../board/session'
import { BoardCanvas } from './BoardCanvas'
import { TextEditor } from './TextEditor'
import { Toolbar } from './Toolbar'
import { useShortcuts } from './useShortcuts'
import { ZoomControls } from './ZoomControls'

/** One board. Render with `key={boardId}` so a new id gets a fresh session. */
export function Board({ boardId }: { boardId: string }) {
  const [{ editor, provider }] = useState(() => createBoardSession(boardId))
  const state = useSyncExternalStore(editor.subscribe, editor.getState)
  useShortcuts(editor)

  useEffect(() => {
    provider.connect()
    return () => provider.disconnect()
  }, [provider])

  // Exposed in development for console debugging and the end-to-end tests.
  useEffect(() => {
    if (import.meta.env.DEV) window.editor = editor
  }, [editor])

  return (
    <div className="board">
      <BoardCanvas editor={editor} />
      <TextEditor editor={editor} state={state} />
      <Toolbar editor={editor} state={state} />
      <ZoomControls editor={editor} state={state} />
    </div>
  )
}
