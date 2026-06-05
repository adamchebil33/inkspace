import { useEffect, useState, useSyncExternalStore } from 'react'
import { Editor } from '../board/editor'
import { BoardStore } from '../board/store'
import { BoardCanvas } from './BoardCanvas'
import { TextEditor } from './TextEditor'
import { Toolbar } from './Toolbar'
import { useShortcuts } from './useShortcuts'
import { ZoomControls } from './ZoomControls'

export function Board() {
  const [editor] = useState(() => new Editor(new BoardStore()))
  const state = useSyncExternalStore(editor.subscribe, editor.getState)
  useShortcuts(editor)

  // Handy for debugging in the browser console during development.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { editor })
  }, [editor])

  return (
    <div className="board">
      <BoardCanvas editor={editor} />
      <TextEditor editor={editor} state={state} />
      <Toolbar editor={editor} state={state} />
      <ZoomControls editor={editor} state={state} />
    </div>
  )
}
