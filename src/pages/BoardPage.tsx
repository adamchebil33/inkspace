import { useEffect, useState } from 'react'
import { canEditBoard } from '../../shared/boardKey'
import { Board } from '../components/Board'
import { savedEditKey } from '../lib/recentBoards'

interface Props {
  boardId: string
  /** Edit key from the link's fragment, if it had one. */
  editKey: string | null
}

interface Access {
  boardId: string
  editKey: string | null
}

/**
 * Work out whether this browser may edit the board: either the link carried
 * a valid key, or we saved one earlier (for example, we created the board
 * and came back through a view-only link).
 */
async function resolveAccess(boardId: string, linkKey: string | null): Promise<Access> {
  for (const key of [linkKey, savedEditKey(boardId)]) {
    if (await canEditBoard(boardId, key)) return { boardId, editKey: key }
  }
  return { boardId, editKey: null }
}

export function BoardPage({ boardId, editKey }: Props) {
  const [access, setAccess] = useState<Access | null>(null)

  useEffect(() => {
    let cancelled = false
    void resolveAccess(boardId, editKey).then((resolved) => {
      if (!cancelled) setAccess(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [boardId, editKey])

  // Checking the key takes a millisecond or two; render nothing meanwhile.
  if (access?.boardId !== boardId) return null
  return (
    <Board
      key={`${boardId}:${access.editKey ? 'edit' : 'view'}`}
      boardId={boardId}
      editKey={access.editKey}
    />
  )
}
