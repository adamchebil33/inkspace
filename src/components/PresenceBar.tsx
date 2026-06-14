import { useState, useSyncExternalStore } from 'react'
import type { Editor } from '../board/editor'
import type { Presence } from '../board/presence'
import { MAX_NAME_LENGTH, cleanName, initials, saveUser } from '../lib/identity'

const MAX_AVATARS = 5

interface Props {
  editor: Editor
  presence: Presence
}

/** Who is on the board. Click yourself to rename, someone else to find them. */
export function PresenceBar({ editor, presence }: Props) {
  const { user, peers } = useSyncExternalStore(presence.subscribe, presence.getState)
  const [draftName, setDraftName] = useState<string | null>(null)

  const commitName = () => {
    const name = cleanName(draftName ?? '')
    if (name && name !== user.name) {
      const renamed = { ...user, name }
      presence.setUser(renamed)
      saveUser(renamed)
    }
    setDraftName(null)
  }

  const shown = peers.slice(0, MAX_AVATARS)
  const hidden = peers.length - shown.length

  return (
    <div className="panel presence">
      <ul className="avatars" aria-label="People on this board">
        <li>
          <button
            type="button"
            className="avatar"
            style={{ background: user.color }}
            title={`${user.name} (you). Click to rename`}
            aria-label={`${user.name} (you). Rename`}
            onClick={() => setDraftName(user.name)}
          >
            {initials(user.name)}
          </button>
        </li>
        {shown.map((peer) => (
          <li key={peer.id}>
            <button
              type="button"
              className="avatar"
              style={{ background: peer.color }}
              title={peer.cursor ? `${peer.name}. Click to jump to their cursor` : peer.name}
              aria-label={peer.name}
              onClick={() => peer.cursor && editor.centerOn(peer.cursor)}
            >
              {initials(peer.name)}
            </button>
          </li>
        ))}
        {hidden > 0 && (
          <li className="avatar more" title={`${hidden} more`}>
            +{hidden}
          </li>
        )}
      </ul>
      {draftName !== null && (
        <input
          className="name-input"
          aria-label="Your name"
          autoFocus
          maxLength={MAX_NAME_LENGTH}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName()
            if (e.key === 'Escape') setDraftName(null)
          }}
        />
      )}
    </div>
  )
}
