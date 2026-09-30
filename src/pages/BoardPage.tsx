import { useState } from 'react'
import { Board } from '../components/Board'
import { savedBoard } from '../lib/recentBoards'

interface Props {
  boardId: string
  /** Owner key or edit token from the link's fragment, if it had one. */
  linkKey: string | null
}

/**
 * Which key to present for this board. A saved owner key always wins: if the
 * owner opens their own board through an edit or view link, they are still
 * the owner. Otherwise use the link's key, or one saved from an earlier visit.
 */
function chooseKey(boardId: string, linkKey: string | null): string | null {
  const saved = savedBoard(boardId)
  if (saved?.role === 'owner') return saved.key
  return linkKey ?? saved?.key ?? null
}

export function BoardPage({ boardId, linkKey }: Props) {
  // Bumped to throw away the session and start a fresh one, when this
  // browser's edit access is withdrawn (see Board).
  const [epoch, setEpoch] = useState(0)

  return (
    <Board
      key={`${boardId}:${epoch}`}
      boardId={boardId}
      accessKey={chooseKey(boardId, linkKey)}
      onAccessLost={() => setEpoch((n) => n + 1)}
    />
  )
}
