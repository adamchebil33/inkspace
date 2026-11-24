import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import type { Editor, EditorState } from '../board/editor'
import { worldToScreen } from '../board/geometry'
import {
  FONT_SIZE,
  LINE_HEIGHT,
  boxTextLines,
  boxTextScale,
  diffText,
  fontFor,
  shiftCaret,
  textAlignOf,
  textScale,
  textWidth,
} from '../board/text'
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

  // What the field held, and where the caret was, the last time we looked.
  const field = useRef<HTMLTextAreaElement>(null)
  const seen = useRef({ id: '', value: '', start: 0, end: 0 })
  const remember = (id: string) => {
    const el = field.current
    if (el) seen.current = { id, value: el.value, start: el.selectionStart, end: el.selectionEnd }
  }

  // Someone else can type into the same shape. When the text changes under
  // us the browser throws the caret to the end; put it back where it was,
  // shifted by whatever they inserted or removed before it.
  const id = shape?.id
  const text = shape?.text
  useLayoutEffect(() => {
    const el = field.current
    if (!el || id === undefined || text === undefined) return
    const before = seen.current
    if (before.id === id && before.value !== text) {
      const edit = diffText(before.value, text)
      if (edit) el.setSelectionRange(shiftCaret(before.start, edit), shiftCaret(before.end, edit))
    }
    remember(id)
  }, [id, text])

  if (!shape) return null

  const { zoom } = state.camera
  const topLeft = worldToScreen(state.camera, shape)
  const align = textAlignOf(shape)
  const formatting: CSSProperties = {
    textAlign: align,
    textDecoration: shape.strike ? 'line-through' : 'none',
  }
  let style: CSSProperties

  if (shape.type === 'text') {
    // Free text: no wrapping, growing as you type. The field is wider than
    // the text so the next letter fits; shift it so the text stays in place.
    const scale = textScale(shape) * zoom
    const spare = FONT_SIZE * scale * 2
    const shift = align === 'left' ? 0 : align === 'right' ? spare : spare / 2
    style = {
      ...formatting,
      left: topLeft.x - shift,
      top: topLeft.y,
      width: shape.w * zoom + spare,
      height: shape.h * zoom,
      font: fontFor(shape, FONT_SIZE * scale, LINE_HEIGHT * scale),
      color: shape.color === 'gray' ? 'var(--fg)' : PALETTE[shape.color].stroke,
      whiteSpace: 'pre',
    }
  } else {
    // Text in a box is centred vertically; pad the textarea to match the canvas.
    const scale = boxTextScale(shape) * zoom
    const width = textWidth(shape)
    const sidePadding = (shape.w - width) / 2
    const lineCount = boxTextLines(shape, measureText).length
    const topPadding = Math.max(0, (shape.h * zoom - lineCount * LINE_HEIGHT * scale) / 2)
    style = {
      ...formatting,
      left: topLeft.x,
      top: topLeft.y,
      width: shape.w * zoom,
      height: shape.h * zoom,
      padding: `${topPadding}px ${sidePadding * zoom}px 0`,
      font: fontFor(shape, FONT_SIZE * scale, LINE_HEIGHT * scale),
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
      ref={field}
      onChange={(e) => {
        // Record our own edit first, so the effect above does not mistake it
        // for someone else's.
        remember(shape.id)
        editor.setText(shape.id, e.target.value)
      }}
      onSelect={() => remember(shape.id)}
      onFocus={(e) => {
        const end = e.target.value.length
        e.target.setSelectionRange(end, end)
        remember(shape.id)
      }}
      onBlur={(e) => {
        // Setting the text size moves the focus into the format panel; keep
        // editing (an empty new text would otherwise be deleted). Clicking the
        // board still ends editing, through the editor.
        if (e.relatedTarget instanceof Element && e.relatedTarget.closest('[data-keeps-editing]'))
          return
        editor.stopEditing()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.currentTarget.blur()
        // Formatting applies to the whole shape, so it works while typing too.
        const key = e.key.toLowerCase()
        const style =
          !(e.ctrlKey || e.metaKey) || e.altKey
            ? null
            : key === 'b' && !e.shiftKey
              ? 'bold'
              : key === 'i' && !e.shiftKey
                ? 'italic'
                : key === 'x' && e.shiftKey
                  ? 'strike'
                  : null
        if (style) {
          e.preventDefault()
          editor.toggleTextFormat(style)
        }
      }}
    />
  )
}
