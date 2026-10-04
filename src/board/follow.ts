import type { Editor } from './editor'
import type { Camera } from './geometry'
import type { Peer, Presence } from './presence'

/** Time for the view to cover ~63% of the gap to the leader's view. */
const EASING_MS = 90

/**
 * Follow mode: keep this client's view on what another person is looking at.
 *
 * The follower announces who it follows in its presence. Seeing that, the
 * leader starts sharing its view (and stops when nobody follows any more, so
 * panning costs no messages the rest of the time). The follower then eases
 * its camera toward that view. Moving the view yourself ends it.
 */
export class Follow {
  private readonly editor: Editor
  private readonly presence: Presence
  private lastStep = 0

  constructor(editor: Editor, presence: Presence) {
    this.editor = editor
    this.presence = presence
    editor.onUserNavigate(() => this.stop())
  }

  /** The person being followed, if any. */
  getLeader(): Peer | null {
    const { following, peers } = this.presence.getState()
    return peers.find((peer) => peer.id === following) ?? null
  }

  start(peerId: number): void {
    this.presence.setFollowing(peerId)
  }

  stop(): void {
    this.presence.setFollowing(null)
  }

  toggle(peerId: number): void {
    if (this.presence.getState().following === peerId) this.stop()
    else this.start(peerId)
  }

  /**
   * Move the camera one frame closer to the leader's view. Called by the
   * canvas on every repaint; returns whether it is still catching up.
   */
  step(now: number): boolean {
    const view = this.getLeader()?.view
    if (!view) return false

    const target = this.editor.cameraForRect(view)
    const current = this.editor.getState().camera
    const dt = Math.min(100, now - this.lastStep)
    this.lastStep = now
    const blend = 1 - Math.exp(-dt / EASING_MS)

    const next: Camera = {
      x: current.x + (target.x - current.x) * blend,
      y: current.y + (target.y - current.y) * blend,
      // Blend zoom as a ratio, so zooming in and out feel alike.
      zoom: current.zoom * (target.zoom / current.zoom) ** blend,
    }
    const arrived =
      Math.abs(target.x - next.x) * next.zoom < 0.5 &&
      Math.abs(target.y - next.y) * next.zoom < 0.5 &&
      Math.abs(target.zoom / next.zoom - 1) < 0.002

    if (arrived && sameCamera(current, target)) return false
    this.editor.followCamera(arrived ? target : next)
    return !arrived
  }
}

const sameCamera = (a: Camera, b: Camera) => a.x === b.x && a.y === b.y && a.zoom === b.zoom
