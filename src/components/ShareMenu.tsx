import { useEffect, useRef, useState } from 'react'
import { boardPath } from '../lib/router'
import { DownloadIcon, EyeIcon, LinkIcon } from './icons'

interface Props {
  boardId: string
  /** Null on a view-only board, which can then only be shared view-only. */
  editKey: string | null
  /** Save the board as an image. False if there was nothing to save. */
  onExport: () => boolean
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** The two links for a board: one that lets people edit, one that doesn't. */
export function ShareMenu({ boardId, editKey, onExport }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'edit' | 'view' | 'failed' | 'empty' | null>(null)
  const root = useRef<HTMLDivElement>(null)

  // Close when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const copy = async (kind: 'edit' | 'view') => {
    const path = boardPath(boardId, kind === 'edit' ? editKey : null)
    const ok = await copyText(`${location.origin}${path}`)
    setCopied(ok ? kind : 'failed')
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="share" ref={root}>
      <button
        type="button"
        className="share-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Share
      </button>
      {open && (
        <div className="panel share-menu" role="dialog" aria-label="Share this board">
          {editKey && (
            <button type="button" className="share-option" onClick={() => copy('edit')}>
              <LinkIcon />
              <span>
                <strong>{copied === 'edit' ? 'Copied!' : 'Copy edit link'}</strong>
                <small>Anyone with this link can edit</small>
              </span>
            </button>
          )}
          <button type="button" className="share-option" onClick={() => copy('view')}>
            <EyeIcon />
            <span>
              <strong>{copied === 'view' ? 'Copied!' : 'Copy view-only link'}</strong>
              <small>They can watch live but not change anything</small>
            </span>
          </button>
          <button
            type="button"
            className="share-option"
            onClick={() => {
              if (onExport()) setOpen(false)
              else setCopied('empty')
            }}
          >
            <DownloadIcon />
            <span>
              <strong>Download as PNG</strong>
              <small>
                {copied === 'empty' ? 'The board is empty' : 'An image of the whole board'}
              </small>
            </span>
          </button>
          {copied === 'failed' && (
            <p className="share-note" role="alert">
              Couldn't copy. Copy the address from your browser instead.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
