import type { ReactNode } from 'react'
import type { Editor, EditorState } from '../board/editor'
import { PALETTE } from '../board/theme'
import { COLORS, type Tool } from '../board/types'
import { EllipseIcon, HandIcon, RectIcon, SelectIcon, StickyIcon } from './icons'

const TOOLS: {
  tool: Tool
  label: string
  shortcut: string
  icon: ReactNode
}[] = [
  { tool: 'select', label: 'Select', shortcut: 'V', icon: <SelectIcon /> },
  { tool: 'hand', label: 'Pan', shortcut: 'H', icon: <HandIcon /> },
  { tool: 'sticky', label: 'Sticky note', shortcut: 'S', icon: <StickyIcon /> },
  { tool: 'rect', label: 'Rectangle', shortcut: 'R', icon: <RectIcon /> },
  { tool: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: <EllipseIcon /> },
]

interface Props {
  editor: Editor
  state: EditorState
}

export function Toolbar({ editor, state }: Props) {
  const isDrawingTool = state.tool !== 'select' && state.tool !== 'hand'
  const showColors = isDrawingTool || state.selection.length > 0

  // Highlight the colour of the selection if it has a single one; otherwise
  // the colour the next new shape will get.
  const selectedColors = new Set(state.selection.map((id) => editor.store.get(id)?.color))
  const activeColor =
    selectedColors.size === 0
      ? state.color
      : selectedColors.size === 1
        ? [...selectedColors][0]
        : null

  return (
    // preventDefault keeps keyboard focus (and any open text editor) where it is.
    <div className="dock" onMouseDown={(e) => e.preventDefault()}>
      {showColors && (
        <div className="panel colors" role="group" aria-label="Colour">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className="swatch"
              style={{
                background: PALETTE[color].fill,
                borderColor: PALETTE[color].stroke,
              }}
              aria-label={color}
              aria-pressed={activeColor === color}
              title={color}
              onClick={() => editor.setColor(color)}
            />
          ))}
        </div>
      )}
      <div className="panel tools" role="toolbar" aria-label="Tools">
        {TOOLS.map(({ tool, label, shortcut, icon }) => (
          <button
            key={tool}
            type="button"
            className="tool"
            aria-label={label}
            aria-pressed={state.tool === tool}
            title={`${label} (${shortcut})`}
            onClick={() => editor.setTool(tool)}
          >
            {icon}
          </button>
        ))}
      </div>
    </div>
  )
}
