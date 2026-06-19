import { useEffect } from 'react'
import type { Editor } from '../board/editor'
import type { Tool } from '../board/types'

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'hand',
  s: 'sticky',
  r: 'rect',
  o: 'ellipse',
  a: 'arrow',
  p: 'pen',
  t: 'text',
}

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement

/** Global keyboard shortcuts for the board. Ignored while typing in a field. */
export function useShortcuts(editor: Editor): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const mod = e.ctrlKey || e.metaKey
      const nudge = NUDGE[key]

      if (key === ' ') editor.setSpaceHeld(true)
      else if (key === 'Delete' || key === 'Backspace') editor.deleteSelection()
      else if (key === 'Escape') editor.cancel()
      else if (nudge)
        editor.nudgeSelection(nudge[0] * (e.shiftKey ? 10 : 1), nudge[1] * (e.shiftKey ? 10 : 1))
      else if (mod && key === 'z' && e.shiftKey) editor.redo()
      else if (mod && key === 'z') editor.undo()
      else if (mod && key === 'y') editor.redo()
      else if (mod && key === 'a') editor.selectAll()
      else if (mod && key === 'd') editor.duplicateSelection()
      else if (key === ']') editor.reorderSelection('front')
      else if (key === '[') editor.reorderSelection('back')
      else if (!mod && !e.altKey && TOOL_KEYS[key]) editor.setTool(TOOL_KEYS[key])
      else return

      e.preventDefault()
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') editor.setSpaceHeld(false)
    }
    const onBlur = () => editor.setSpaceHeld(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [editor])
}
