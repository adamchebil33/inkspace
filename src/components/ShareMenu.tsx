import { useEffect, useRef, useState } from 'react'
import { editTokenFor, hashEditToken } from '../../shared/boardKey'
import type { Access } from '../board/sync-client'
import { boardPath } from '../lib/router'
import { DownloadIcon, EyeIcon, KeyIcon, LinkIcon, ResetIcon } from './icons'

interface Props {
  boardId: string
  /** The owner key or edit token this browser holds. */
  accessKey: string | null
  /** What the server allows; null until it has answered. */
  access: Access | null
  /** Owner only: replace the edit link with one whose token has this hash. */
  onResetEditLink: (generation: number, hash: string) => void
  /** Save the board as an image. False if there was nothing to save. */
  onExport: () => boolean
}

type Notice = 'edit' | 'view' | 'owner' | 'failed' | 'empty' | 'confirm-reset' | 'reset' | null

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Links to a board, by what they allow. Everyone can hand out a view-only
 * link, editors can pass on the edit link they came in with, and the owner
 * can also replace the edit link, which cuts off everyone using the old one.
 */
export function ShareMenu({ boardId, accessKey, access, onResetEditLink, onExport }: Props) {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const root = useRef<HTMLDivElement>(null)

  const role = access?.role ?? 'viewer'
  const generation = access?.generation ?? 0
  const ownerKey = role === 'owner' ? accessKey : null

  // The owner works out the current edit token from their key; an editor
  // already holds it.
  const [ownerToken, setOwnerToken] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void Promise.resolve(ownerKey ? editTokenFor(ownerKey, generation) : null).then((token) => {
      if (!cancelled) setOwnerToken(token)
    })
    return () => {
      cancelled = true
    }
  }, [ownerKey, generation])
  const editToken = role === 'owner' ? ownerToken : role === 'editor' ? accessKey : null

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

  const copy = async (kind: 'edit' | 'view' | 'owner') => {
    const key = kind === 'edit' ? editToken : kind === 'owner' ? ownerKey : null
    const ok = await copyText(`${location.origin}${boardPath(boardId, key)}`)
    setNotice(ok ? kind : 'failed')
    setTimeout(() => setNotice((current) => (current === kind ? null : current)), 2000)
  }

  const resetEditLink = async () => {
    if (!ownerKey) return
    if (notice !== 'confirm-reset') {
      setNotice('confirm-reset')
      return
    }
    const next = generation + 1
    onResetEditLink(next, await hashEditToken(await editTokenFor(ownerKey, next)))
    setNotice('reset')
  }

  return (
    <div className="share" ref={root}>
      <button
        type="button"
        className="share-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          setNotice(null)
        }}
      >
        Share
      </button>
      {open && (
        <div className="panel share-menu" role="dialog" aria-label="Share this board">
          {editToken && (
            <button type="button" className="share-option" onClick={() => copy('edit')}>
              <LinkIcon />
              <span>
                <strong>{notice === 'edit' ? 'Copied!' : 'Copy edit link'}</strong>
                <small>Anyone with this link can edit</small>
              </span>
            </button>
          )}
          <button type="button" className="share-option" onClick={() => copy('view')}>
            <EyeIcon />
            <span>
              <strong>{notice === 'view' ? 'Copied!' : 'Copy view-only link'}</strong>
              <small>They can watch live but not change anything</small>
            </span>
          </button>
          <button
            type="button"
            className="share-option"
            onClick={() => {
              if (onExport()) setOpen(false)
              else setNotice('empty')
            }}
          >
            <DownloadIcon />
            <span>
              <strong>Download as PNG</strong>
              <small>
                {notice === 'empty' ? 'The board is empty' : 'An image of the whole board'}
              </small>
            </span>
          </button>

          {ownerKey && (
            <>
              <p className="share-heading">You own this board</p>
              <button type="button" className="share-option" onClick={() => void resetEditLink()}>
                <ResetIcon />
                <span>
                  <strong>
                    {notice === 'confirm-reset' ? 'Click again to confirm' : 'Reset edit link'}
                  </strong>
                  <small>
                    {notice === 'reset'
                      ? 'Done. Old edit links are now view-only.'
                      : 'Old edit links stop working, for everyone'}
                  </small>
                </span>
              </button>
              <button type="button" className="share-option" onClick={() => copy('owner')}>
                <KeyIcon />
                <span>
                  <strong>{notice === 'owner' ? 'Copied!' : 'Copy owner link'}</strong>
                  <small>Full control, for your other devices. Keep it private</small>
                </span>
              </button>
            </>
          )}

          {notice === 'failed' && (
            <p className="share-note" role="alert">
              Couldn't copy. Your browser blocked access to the clipboard.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
