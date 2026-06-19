import type { CSSProperties } from 'react'
import type { Editor, EditorState } from '../board/editor'
import { worldToScreen } from '../board/geometry'
import { FONT_FAMILY, FONT_SIZE, LINE_HEIGHT, textScale, textWidth, wrapText } from '../board/text'
import { PALETTE, SHAPE_TEXT_COLOR } from '../board/theme'
import { measureText } from '../lib/measure'

interface Props {
  editor: Editor
  state: EditorState
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
  let style: CSSProperties

  if (shape.type === 'text') {
    // Free text: left-aligned, no wrapping, growing as you type.
    const scale = textScale(shape) * zoom
    style = {
      left: topLeft.x,
      top: topLeft.y,
      width: shape.w * zoom + FONT_SIZE * scale * 2,
      height: shape.h * zoom,
      font: `${FONT_SIZE * scale}px/${LINE_HEIGHT * scale}px ${FONT_FAMILY}`,
      color: shape.color === 'gray' ? 'var(--fg)' : PALETTE[shape.color].stroke,
      textAlign: 'left',
      whiteSpace: 'pre',
    }
  } else {
    // Text in a box is centred both ways; pad the textarea to match the canvas.
    const width = textWidth(shape)
    const sidePadding = (shape.w - width) / 2
    const lineCount = wrapText(shape.text, width, measureText).length
    const topPadding = Math.max(0, (shape.h - lineCount * LINE_HEIGHT) / 2)
    style = {
      left: topLeft.x,
      top: topLeft.y,
      width: shape.w * zoom,
      height: shape.h * zoom,
      padding: `${topPadding * zoom}px ${sidePadding * zoom}px 0`,
      font: `${FONT_SIZE * zoom}px/${LINE_HEIGHT * zoom}px ${FONT_FAMILY}`,
      color: SHAPE_TEXT_COLOR,
    }
  }

  return (
    <textarea
      key={shape.id}
      className="text-editor"
      aria-label="Shape text"
      autoFocus
      value={shape.text}
      placeholder={shape.type === 'sticky' ? 'Type something' : ''}
      style={style}
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
