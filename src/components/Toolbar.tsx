import type { ReactNode } from 'react'
import type { Editor, EditorState } from '../board/editor'
import { PALETTE } from '../board/theme'
import { COLORS, type ColorName, type Tool } from '../board/types'
import {
  ArrowIcon,
  EllipseIcon,
  HandIcon,
  PenIcon,
  RectIcon,
  SelectIcon,
  StickyIcon,
  TextIcon,
} from './icons'

const TOOLS: { tool: Tool; label: string; shortcut: string; icon: ReactNode }[] = [
  { tool: 'select', label: 'Select', shortcut: 'V', icon: <SelectIcon /> },
  { tool: 'hand', label: 'Pan', shortcut: 'H', icon: <HandIcon /> },
  { tool: 'sticky', label: 'Sticky note', shortcut: 'S', icon: <StickyIcon /> },
  { tool: 'rect', label: 'Rectangle', shortcut: 'R', icon: <RectIcon /> },
  { tool: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: <EllipseIcon /> },
  { tool: 'arrow', label: 'Arrow', shortcut: 'A', icon: <ArrowIcon /> },
  { tool: 'pen', label: 'Pen', shortcut: 'P', icon: <PenIcon /> },
  { tool: 'text', label: 'Text', shortcut: 'T', icon: <TextIcon /> },
]

interface Props {
  editor: Editor
  state: EditorState
}

export function Toolbar({ editor, state }: Props) {
  const isDrawingTool = state.tool !== 'select' && state.tool !== 'hand'
  const showColors = isDrawingTool || state.selection.length > 0
  const ink = state.colorFamily === 'ink'

  // Highlight the colour of the selection if it has a single one; otherwise
  // the colour the next new shape will get.
  const selectedColors = new Set(state.selection.map((id) => editor.store.get(id)?.color))
  const activeColor =
    selectedColors.size === 0
      ? state.color
      : selectedColors.size === 1
        ? [...selectedColors][0]
        : null

  // Boxes show their fill; pen, arrows and text show their line colour, where
  // gray stands for the default ink (dark on light, light on dark).
  const swatchStyle = (color: ColorName) =>
    ink
      ? {
          background: color === 'gray' ? 'var(--fg)' : PALETTE[color].stroke,
          borderColor: 'transparent',
        }
      : { background: PALETTE[color].fill, borderColor: PALETTE[color].stroke }

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
              style={swatchStyle(color)}
              aria-label={ink && color === 'gray' ? 'default' : color}
              aria-pressed={activeColor === color}
              title={ink && color === 'gray' ? 'default' : color}
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
