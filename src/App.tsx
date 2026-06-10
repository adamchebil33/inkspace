import { Board } from './components/Board'
import { boardIdFromPath, newBoardId } from './lib/boardId'

/** The board in the URL, creating one first if the URL doesn't name one. */
function currentBoardId(): string {
  const existing = boardIdFromPath(location.pathname)
  if (existing) return existing
  const id = newBoardId()
  history.replaceState(null, '', `/b/${id}`)
  return id
}

export function App() {
  const boardId = currentBoardId()
  return <Board key={boardId} boardId={boardId} />
}
