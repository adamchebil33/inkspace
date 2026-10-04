import { useState, useSyncExternalStore } from 'react'
import type { Follow } from '../board/follow'
import type { Presence } from '../board/presence'
import { MAX_NAME_LENGTH, cleanName, initials, saveUser } from '../lib/identity'

const MAX_AVATARS = 5

interface Props {
  presence: Presence
  follow: Follow
}

/** Who is on the board. Click yourself to rename, someone else to follow their view. */
export function PresenceBar({ presence, follow }: Props) {
  const { user, peers, following } = useSyncExternalStore(presence.subscribe, presence.getState)
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
    <div className="presence">
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
              title={
                following === peer.id
                  ? `Following ${peer.name}. Click to stop`
                  : `${peer.name}. Click to follow their view`
              }
              aria-label={peer.name}
              aria-pressed={following === peer.id}
              onClick={() => follow.toggle(peer.id)}
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
