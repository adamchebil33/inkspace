import { useState, useSyncExternalStore } from 'react'
import type { SyncClient } from '../board/sync-client'

/**
 * Says nothing while connected. Otherwise explains what is going on: edits
 * keep working offline and merge when the connection comes back.
 */
export function ConnectionStatus({ sync }: { sync: SyncClient }) {
  const status = useSyncExternalStore(sync.subscribe, sync.getStatus)
  const [wasConnected, setWasConnected] = useState(false)
  if (status === 'connected' && !wasConnected) setWasConnected(true)

  if (status === 'connected') return null
  return (
    <div className="panel connection" role="status">
      <span className="connection-dot" />
      {wasConnected
        ? 'Offline. Keep working: your changes will sync when you reconnect.'
        : 'Connecting…'}
    </div>
  )
}
