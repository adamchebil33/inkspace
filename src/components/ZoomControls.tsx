import { useState } from 'react'
import type { Editor, EditorState } from '../board/editor'
import { FitIcon, HelpIcon } from './icons'
import { ShortcutsDialog } from './ShortcutsDialog'
import { ThemeToggle } from './ThemeToggle'

interface Props {
  editor: Editor
  state: EditorState
}

const STEP = 1.25

/** Bottom-right corner: zoom, fit to content, theme and keyboard help. */
export function ZoomControls({ editor, state }: Props) {
  const { zoom } = state.camera
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <>
      <div className="panel zoom" onMouseDown={(e) => e.preventDefault()}>
        <button
          type="button"
          className="tool"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
          onClick={() => setHelpOpen(true)}
        >
          <HelpIcon />
        </button>
        <ThemeToggle />
        <span className="divider" />
        <button
          type="button"
          className="tool"
          aria-label="Zoom out"
          onClick={() => editor.setZoom(zoom / STEP)}
        >
          −
        </button>
        <button
          type="button"
          className="zoom-level"
          title="Reset zoom to 100%"
          onClick={() => editor.setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="tool"
          aria-label="Zoom in"
          onClick={() => editor.setZoom(zoom * STEP)}
        >
          +
        </button>
        <button
          type="button"
          className="tool"
          aria-label="Zoom to fit"
          title="Zoom to fit (Shift+1)"
          onClick={() => editor.zoomToFit()}
        >
          <FitIcon />
        </button>
      </div>
      {helpOpen && <ShortcutsDialog onClose={() => setHelpOpen(false)} />}
    </>
  )
}
