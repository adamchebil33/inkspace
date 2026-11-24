import { useState, type ReactNode } from 'react'
import type { Editor } from '../board/editor'
import { MAX_FONT_SIZE, MIN_FONT_SIZE, TEXT_ALIGNS, type TextAlign } from '../board/types'
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ItalicIcon,
  StrikeIcon,
} from './icons'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

const STYLES: {
  key: 'bold' | 'italic' | 'strike'
  label: string
  keys: string
  icon: ReactNode
}[] = [
  { key: 'bold', label: 'Bold', keys: `${mod}B`, icon: <BoldIcon /> },
  { key: 'italic', label: 'Italic', keys: `${mod}I`, icon: <ItalicIcon /> },
  {
    key: 'strike',
    label: 'Strikethrough',
    keys: `${mod}${isMac ? '⇧X' : 'Shift+X'}`,
    icon: <StrikeIcon />,
  },
]

const ALIGNS: Record<TextAlign, { label: string; icon: ReactNode }> = {
  left: { label: 'left', icon: <AlignLeftIcon /> },
  center: { label: 'centre', icon: <AlignCenterIcon /> },
  right: { label: 'right', icon: <AlignRightIcon /> },
}

/**
 * Text formatting for the selected notes, shapes and text. It applies to a
 * shape's whole text, and shows only while there is text to format: a shape
 * being typed into, or selected shapes that have text.
 */
export function FormatPanel({ editor }: { editor: Editor }) {
  const format = editor.getTextFormat()
  if (!format) return null

  // One button steps through the alignments, showing the current one.
  const align = format.align ?? 'center'
  const nextAlign = TEXT_ALIGNS[(TEXT_ALIGNS.indexOf(align) + 1) % TEXT_ALIGNS.length]!

  return (
    <div className="panel format" role="toolbar" aria-label="Text format" data-keeps-editing>
      <div className="format-group">
        <SizeField
          value={format.fontSize}
          onChange={(fontSize) => editor.setTextFormat({ fontSize })}
          onDone={() => {
            // Back to typing, if a shape is still being edited.
            if (editor.getState().editingId) {
              document.querySelector<HTMLTextAreaElement>('textarea.text-editor')?.focus()
            }
          }}
        />
      </div>
      <div className="format-group">
        {STYLES.map(({ key, label, keys, icon }) => (
          <button
            key={key}
            type="button"
            className="tool"
            aria-label={label}
            aria-pressed={format[key]}
            title={`${label} (${keys})`}
            onClick={() => editor.toggleTextFormat(key)}
          >
            {icon}
          </button>
        ))}
      </div>
      <div className="format-group">
        <button
          type="button"
          className="tool"
          aria-label={`Align ${ALIGNS[align].label}`}
          title={`Aligned ${ALIGNS[align].label}. Click to align ${ALIGNS[nextAlign].label}`}
          onClick={() => editor.setTextFormat({ align: nextAlign })}
        >
          {ALIGNS[align].icon}
        </button>
      </div>
    </div>
  )
}

/**
 * The text size as a number. Typing a size applies it on Enter or when
 * leaving the field; the arrow keys step it by 1 (10 with Shift) straight away.
 */
function SizeField({
  value,
  onChange,
  onDone,
}: {
  value: number | null
  onChange: (size: number) => void
  /** Enter or Escape: finished with the field. */
  onDone: () => void
}) {
  // What is being typed, until it is applied; null shows the current size.
  const [draft, setDraft] = useState<string | null>(null)

  const apply = () => {
    const size = Number(draft)
    if (draft !== null && draft.trim() !== '' && Number.isFinite(size)) onChange(size)
    setDraft(null)
  }

  return (
    <input
      className="size-field"
      type="number"
      inputMode="decimal"
      min={MIN_FONT_SIZE}
      max={MAX_FONT_SIZE}
      aria-label="Text size"
      title="Text size (↑ and ↓ to change it)"
      // Several shapes with different sizes: show none.
      placeholder="–"
      value={draft ?? (value === null ? '' : String(value))}
      // The dock keeps focus where it is on mouse down; this field needs it.
      onMouseDown={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          // Otherwise the same key press reaches the text box as a new line.
          e.preventDefault()
          apply()
          onDone()
        } else if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
          onDone()
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          // Step from what was typed, if anything, else from the current size.
          const typed = draft !== null && draft.trim() !== '' ? Number(draft) : NaN
          const from = Number.isFinite(typed) ? typed : value
          if (from === null) return
          const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1)
          setDraft(null)
          onChange(Math.round(from) + step)
        }
      }}
    />
  )
}
