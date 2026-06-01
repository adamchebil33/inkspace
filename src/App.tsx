import { useEffect, useState } from 'react'

type ServerStatus = 'checking' | 'online' | 'offline'

export function App() {
  const [status, setStatus] = useState<ServerStatus>('checking')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setStatus(res.ok ? 'online' : 'offline'))
      .catch(() => setStatus('offline'))
  }, [])

  return (
    <main className="landing">
      <h1>Inkspace</h1>
      <p>A multiplayer whiteboard. Share a link and draw together live.</p>
      <p className="status" data-status={status}>
        Server: {status}
      </p>
    </main>
  )
}
