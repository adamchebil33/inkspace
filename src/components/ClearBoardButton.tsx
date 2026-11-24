import { useEffect, useState } from 'react'
import type { Editor } from '../board/editor'
import { TrashIcon } from './icons'

/** How long the button waits for the confirming second click. */
const CONFIRM_MS = 3000

/**
 * Deletes every shape on the board, for everyone. The first click only asks
 * for confirmation; a second click within a few seconds clears the board.
 * It is one undo step, so the person who cleared it can bring it all back.
 */
export function ClearBoardButton({ editor, empty }: { editor: Editor; empty: boolean }) {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [confirming])

  return (
    <button
      type="button"
      className={confirming ? 'tool clear-board confirming' : 'tool clear-board'}
      aria-label={confirming ? 'Click again to clear the board' : 'Clear board'}
      title={confirming ? 'Click again to delete everything, for everyone' : 'Clear board'}
      disabled={empty && !confirming}
      onBlur={() => setConfirming(false)}
      onClick={() => {
        if (!confirming) {
          setConfirming(true)
          return
        }
        setConfirming(false)
        editor.clearBoard()
      }}
    >
      <TrashIcon />
      {confirming && <span>Clear all?</span>}
    </button>
  )
}
