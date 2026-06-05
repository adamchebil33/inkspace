import type { Editor, EditorState } from '../board/editor'
import { worldToScreen } from '../board/geometry'
import { FONT, FONT_FAMILY, FONT_SIZE, LINE_HEIGHT, textWidth, wrapText } from '../board/text'
import { SHAPE_TEXT_COLOR } from '../board/theme'

interface Props {
  editor: Editor
  state: EditorState
}

let measureCtx: CanvasRenderingContext2D | null = null

function measure(text: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return 0
  measureCtx.font = FONT
  return measureCtx.measureText(text).width
}

/**
 * A textarea laid exactly over the shape being edited. The canvas skips that
 * shape's text meanwhile, so it looks like you are typing straight onto it.
 */
export function TextEditor({ editor, state }: Props) {
  const shape = state.editingId ? editor.store.get(state.editingId) : undefined
  if (!shape) return null

  const { zoom } = state.camera
  const topLeft = worldToScreen(state.camera, shape)
  const width = textWidth(shape)
  const sidePadding = (shape.w - width) / 2

  // Canvas text is vertically centred; pad the textarea to match.
  const lineCount = wrapText(shape.text, width, measure).length
  const topPadding = Math.max(0, (shape.h - lineCount * LINE_HEIGHT) / 2)

  return (
    <textarea
      key={shape.id}
      className="text-editor"
      aria-label="Shape text"
      autoFocus
      value={shape.text}
      placeholder={shape.type === 'sticky' ? 'Type something' : ''}
      style={{
        left: topLeft.x,
        top: topLeft.y,
        width: shape.w * zoom,
        height: shape.h * zoom,
        padding: `${topPadding * zoom}px ${sidePadding * zoom}px 0`,
        font: `${FONT_SIZE * zoom}px/${LINE_HEIGHT * zoom}px ${FONT_FAMILY}`,
        color: SHAPE_TEXT_COLOR,
      }}
      onChange={(e) => editor.setText(shape.id, e.target.value)}
      onFocus={(e) => {
        const end = e.target.value.length
        e.target.setSelectionRange(end, end)
      }}
      onBlur={() => editor.stopEditing()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.currentTarget.blur()
      }}
    />
  )
}
