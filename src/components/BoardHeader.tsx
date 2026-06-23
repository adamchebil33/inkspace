import type { Editor, EditorState } from '../board/editor'
import { MAX_TITLE_LENGTH } from '../board/store'
import { navigate } from '../lib/router'
import { HistoryControls } from './HistoryControls'
import { Logo } from './icons'

interface Props {
  editor: Editor
  state: EditorState
}

/** Top-left corner: back to the home page, the board's title, undo and redo. */
export function BoardHeader({ editor, state }: Props) {
  return (
    <header className="panel board-header">
      <a
        href="/"
        className="home-link"
        aria-label="All boards"
        title="All boards"
        onClick={(e) => {
          e.preventDefault()
          navigate('/')
        }}
      >
        <Logo />
      </a>
      <input
        className="title-input"
        aria-label="Board title"
        placeholder="Untitled board"
        maxLength={MAX_TITLE_LENGTH}
        readOnly={state.readOnly}
        value={editor.store.getTitle()}
        onChange={(e) => editor.store.setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
        }}
      />
      {!state.readOnly && <HistoryControls editor={editor} state={state} />}
    </header>
  )
}
