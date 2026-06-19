import type { Editor, EditorState } from '../board/editor'
import { RedoIcon, UndoIcon } from './icons'

interface Props {
  editor: Editor
  state: EditorState
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

/** Undo and redo. They only ever revert your own edits, never other people's. */
export function HistoryControls({ editor, state }: Props) {
  return (
    <div className="panel history" onMouseDown={(e) => e.preventDefault()}>
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
    </div>
  )
}
