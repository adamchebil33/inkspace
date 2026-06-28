import { useEffect, useState, useSyncExternalStore } from 'react'
import { createBoardSession } from '../board/session'
import { rememberBoard } from '../lib/recentBoards'
import { BoardCanvas } from './BoardCanvas'
import { BoardHeader } from './BoardHeader'
import { ConnectionStatus } from './ConnectionStatus'
import { PresenceBar } from './PresenceBar'
import { ShareMenu } from './ShareMenu'
import { SummaryPanel } from './SummaryPanel'
import { SparklesIcon } from './icons'
import { TextEditor } from './TextEditor'
import { Toolbar } from './Toolbar'
import { useShortcuts } from './useShortcuts'
import { ZoomControls } from './ZoomControls'

interface Props {
  boardId: string
  /** Null opens the board view-only. */
  editKey: string | null
}

/** One board. Render with a `key` so a different board gets a fresh session. */
export function Board({ boardId, editKey }: Props) {
  const [{ editor, sync, presence }] = useState(() => createBoardSession(boardId, editKey))
  const state = useSyncExternalStore(editor.subscribe, editor.getState)
  useShortcuts(editor)
  const [summaryOpen, setSummaryOpen] = useState(false)

  useEffect(() => {
    sync.connect()
    return () => sync.disconnect()
  }, [sync])

  // Keep the home page's list of boards and the tab title up to date.
  const title = editor.store.getTitle()
  useEffect(() => {
    rememberBoard({ id: boardId, editKey, title })
    document.title = title ? `${title} · Inkspace` : 'Inkspace'
    return () => {
      document.title = 'Inkspace'
    }
  }, [boardId, editKey, title])

  // Exposed in development for console debugging and the end-to-end tests.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { editor, presence, sync })
  }, [editor, presence, sync])

  return (
    <div className="board">
      <BoardCanvas editor={editor} presence={presence} />
      <TextEditor editor={editor} state={state} />
      <BoardHeader editor={editor} state={state} />
      <ConnectionStatus sync={sync} />
      <div className="panel board-actions">
        {state.readOnly && <span className="badge">View only</span>}
        <PresenceBar editor={editor} presence={presence} />
        <button
          type="button"
          className="tool"
          aria-label="Summarize board"
          aria-pressed={summaryOpen}
          title="Summarize the board with AI"
          onClick={() => setSummaryOpen(!summaryOpen)}
        >
          <SparklesIcon />
        </button>
        <ShareMenu boardId={boardId} editKey={editKey} />
      </div>
      {summaryOpen && (
        <SummaryPanel
          boardId={boardId}
          editor={editor}
          readOnly={state.readOnly}
          onClose={() => setSummaryOpen(false)}
        />
      )}
      {!state.readOnly && <Toolbar editor={editor} state={state} />}
      <ZoomControls editor={editor} state={state} />
    </div>
  )
}
