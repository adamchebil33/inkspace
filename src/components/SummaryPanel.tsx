import { useEffect, useState } from 'react'
import type { SummaryError, SummaryResponse } from '../../shared/summary'
import type { Editor } from '../board/editor'
import { requestSummary } from '../lib/summary'
import { CloseIcon } from './icons'

interface Props {
  boardId: string
  editor: Editor
  readOnly: boolean
  onClose: () => void
}

/** Width of the panel plus its margin, in pixels (see .summary in the CSS). */
const PANEL_WIDTH = 356

const ERROR_MESSAGE: Record<SummaryError, string> = {
  empty: 'There is nothing to summarize yet. Add a few sticky notes and try again.',
  not_configured:
    'AI summaries are not set up on this server. Everything else on the board works as usual.',
  rate_limited: 'Too many summaries in a short time.',
  failed: 'The AI service could not be reached. Your board is fine; try again in a moment.',
}

/**
 * Side panel with an AI summary of the board: an overview, the notes grouped
 * into themes, and suggested action items that can be dropped onto the board
 * as sticky notes. Purely additive: if the AI is down, only this panel is.
 */
export function SummaryPanel({ boardId, editor, readOnly, onClose }: Props) {
  // null while a request is in flight.
  const [result, setResult] = useState<SummaryResponse | null>(null)
  const [added, setAdded] = useState(false)

  const load = () => {
    setResult(null)
    setAdded(false)
    void requestSummary(boardId).then(setResult)
  }

  // Summarize as soon as the panel opens.
  useEffect(() => {
    let cancelled = false
    void requestSummary(boardId).then((response) => {
      if (!cancelled) setResult(response)
    })
    return () => {
      cancelled = true
    }
  }, [boardId])

  return (
    <aside className="panel summary" aria-label="Board summary">
      <header className="summary-header">
        <h2>Summary</h2>
        <button type="button" className="tool" aria-label="Close summary" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <div className="summary-body" aria-live="polite">
        {result === null && <p className="summary-status">Reading the board…</p>}

        {result && !result.ok && (
          <p className="summary-status" role="alert">
            {ERROR_MESSAGE[result.error]}
            {result.error === 'rate_limited' && result.retryAfterSeconds
              ? ` Try again in ${result.retryAfterSeconds} seconds.`
              : ''}
          </p>
        )}

        {result?.ok && (
          <>
            <p>{result.summary.summary}</p>

            {result.summary.themes.length > 0 && <h3>Themes</h3>}
            {result.summary.themes.map((theme) => (
              <section key={theme.title} className="theme">
                <h4>{theme.title}</h4>
                <ul>
                  {theme.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </section>
            ))}

            {result.summary.actionItems.length > 0 && (
              <>
                <h3>Action items</h3>
                <ul className="actions">
                  {result.summary.actionItems.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
                {!readOnly && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={added}
                    onClick={() => {
                      // On wide screens this panel covers the right edge.
                      const covered = window.innerWidth > 800 ? PANEL_WIDTH : 0
                      editor.addStickies(result.summary.actionItems, covered)
                      setAdded(true)
                    }}
                  >
                    {added ? 'Added to the board' : 'Add as sticky notes'}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {result && (
        <footer className="summary-footer">
          <button type="button" className="secondary" onClick={load}>
            {result.ok ? 'Summarize again' : 'Try again'}
          </button>
          <small>Written by AI. Check it against the board.</small>
        </footer>
      )}
    </aside>
  )
}
