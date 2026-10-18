import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { downloadCanvas, exportFilename, renderBoardImage } from '../board/export'
import { createBoardSession } from '../board/session'
import type { TemplateId } from '../board/templates'
import { DARK_THEME, LIGHT_THEME } from '../board/theme'
import { rememberBoard } from '../lib/recentBoards'
import { getTheme } from '../lib/theme'
import { BoardCanvas } from './BoardCanvas'
import { BoardHeader } from './BoardHeader'
import { ConnectionStatus } from './ConnectionStatus'
import { FollowBanner } from './FollowBanner'
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
  /** Owner key or edit token to present to the server, if this browser has one. */
  accessKey: string | null
  /** This browser could edit, and the server has just withdrawn that. */
  onAccessLost: () => void
  /** Starter content, for a board that was just created from a template. */
  template?: TemplateId | null
}

/** One board. Render with a `key` so a different board gets a fresh session. */
export function Board({ boardId, accessKey, onAccessLost, template = null }: Props) {
  const [{ editor, sync, presence, follow }] = useState(() =>
    createBoardSession(boardId, accessKey, template),
  )
  const state = useSyncExternalStore(editor.subscribe, editor.getState)
  // What the server lets this connection do; null until it has answered.
  const access = useSyncExternalStore(sync.subscribe, sync.getAccess)
  const role = access?.role
  useShortcuts(editor)
  const [summaryOpen, setSummaryOpen] = useState(false)

  useEffect(() => {
    sync.connect()
    return () => sync.disconnect()
  }, [sync])

  // Keep the home page's list of boards and the tab title up to date.
  const title = editor.store.getTitle()
  useEffect(() => {
    document.title = title ? `${title} · Inkspace` : 'Inkspace'
    return () => {
      document.title = 'Inkspace'
    }
  }, [title])

  useEffect(() => {
    if (!role) return
    // A key that turned out to grant nothing (a revoked edit link) is dropped.
    const saved = rememberBoard({
      id: boardId,
      key: role === 'viewer' ? null : accessKey,
      role,
      title,
    })
    // Keep secrets out of the address bar where that is safe: the owner key
    // once it is saved here (so the address can be shared without handing
    // over the board), and a key that no longer works.
    if (location.hash && ((role === 'owner' && saved) || role === 'viewer')) {
      history.replaceState(null, '', location.pathname)
    }
  }, [boardId, accessKey, role, title])

  // If this person was editing and no longer may (the edit link was reset,
  // or the board filled up), their copy may hold edits the server refused.
  // Start again from the server's version, view-only.
  const editable = access ? access.role !== 'viewer' && !access.full : null
  const couldEdit = useRef(false)
  useEffect(() => {
    if (editable === null) return
    if (couldEdit.current && !editable) onAccessLost()
    couldEdit.current = editable
  }, [editable, onAccessLost])

  // Exposed in development for console debugging and the end-to-end tests.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { editor, presence, sync })
  }, [editor, presence, sync])

  return (
    <div className="board">
      <BoardCanvas editor={editor} presence={presence} follow={follow} />
      <TextEditor editor={editor} state={state} />
      <BoardHeader editor={editor} state={state} />
      <ConnectionStatus sync={sync} />
      {access?.full && (
        <div className="panel board-full" role="status">
          This board has reached its size limit and is now read-only. You can still view it, follow
          others and download it as a PNG.
        </div>
      )}
      <FollowBanner presence={presence} follow={follow} />
      <div className="panel board-actions">
        {role === 'viewer' && <span className="badge">View only</span>}
        <PresenceBar presence={presence} follow={follow} />
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
        <ShareMenu
          boardId={boardId}
          accessKey={accessKey}
          access={access}
          onResetEditLink={(generation, hash) => sync.resetEditLink(generation, hash)}
          onExport={() => {
            const theme = getTheme() === 'dark' ? DARK_THEME : LIGHT_THEME
            const image = renderBoardImage(editor.store.list(), theme)
            if (image) downloadCanvas(image, exportFilename(title))
            return image !== null
          }}
        />
      </div>
      {summaryOpen && (
        <SummaryPanel
          boardId={boardId}
          editor={editor}
          readOnly={state.readOnly}
          onClose={() => setSummaryOpen(false)}
        />
      )}
      {!state.readOnly && editor.store.list().length === 0 && (
        <p className="empty-hint">Double-click anywhere to add a sticky note</p>
      )}
      {!state.readOnly && <Toolbar editor={editor} state={state} />}
      <ZoomControls editor={editor} state={state} />
    </div>
  )
}
