import { useSyncExternalStore } from 'react'
import type { Follow } from '../board/follow'
import type { Presence } from '../board/presence'

interface Props {
  presence: Presence
  follow: Follow
}

/**
 * Shows that this view is following someone (with a frame in their colour
 * and a way to stop), or that others are following this view.
 */
export function FollowBanner({ presence, follow }: Props) {
  const { peers, following, selfId } = useSyncExternalStore(presence.subscribe, presence.getState)
  const leader = peers.find((peer) => peer.id === following)
  const followers = peers.filter((peer) => peer.following === selfId)

  if (leader) {
    return (
      <>
        <div className="follow-frame" style={{ borderColor: leader.color }} aria-hidden="true" />
        <div className="panel follow-pill" role="status" style={{ borderColor: leader.color }}>
          Following {leader.name}
          <button type="button" className="secondary" onClick={() => follow.stop()}>
            Stop
          </button>
        </div>
      </>
    )
  }

  if (followers.length === 0) return null
  return (
    <div className="panel follow-pill" role="status">
      {followers.length === 1
        ? `${followers[0]!.name} is following you`
        : `${followers.length} people are following you`}
    </div>
  )
}
