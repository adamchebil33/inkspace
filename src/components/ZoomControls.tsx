import type { Editor, EditorState } from '../board/editor'

interface Props {
  editor: Editor
  state: EditorState
}

const STEP = 1.25

export function ZoomControls({ editor, state }: Props) {
  const { zoom } = state.camera
  return (
    <div className="panel zoom" onMouseDown={(e) => e.preventDefault()}>
      <button type="button" aria-label="Zoom out" onClick={() => editor.setZoom(zoom / STEP)}>
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
      <button type="button" aria-label="Zoom in" onClick={() => editor.setZoom(zoom * STEP)}>
        +
      </button>
    </div>
  )
}
