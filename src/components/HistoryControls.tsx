import type { Editor, EditorState } from '../board/editor'
import { ClearBoardButton } from './ClearBoardButton'
import { RedoIcon, UndoIcon } from './icons'

interface Props {
  editor: Editor
  state: EditorState
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

/**
 * Undo and redo, which only ever revert your own edits, never other
 * people's, and clearing the board.
 */
export function HistoryControls({ editor, state }: Props) {
  return (
    <div className="history" onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        className="tool"
        aria-label="Undo"
        title={`Undo (${mod}Z)`}
        disabled={!state.canUndo}
        onClick={() => editor.undo()}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        className="tool"
        aria-label="Redo"
        title={`Redo (${mod}${isMac ? '⇧Z' : 'Shift+Z'})`}
        disabled={!state.canRedo}
        onClick={() => editor.redo()}
      >
        <RedoIcon />
      </button>
      <ClearBoardButton editor={editor} empty={editor.store.list().length === 0} />
    </div>
  )
}
