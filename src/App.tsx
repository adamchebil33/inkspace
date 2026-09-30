import { useRoute, navigate } from './lib/router'
import { BoardPage } from './pages/BoardPage'
import { Home } from './pages/Home'

export function App() {
  const route = useRoute()

  if (route.page === 'home') return <Home />
  if (route.page === 'board') return <BoardPage boardId={route.boardId} linkKey={route.key} />
  return (
    <div className="home">
      <main className="home-main">
        <h1>Page not found</h1>
        <p className="lede">That link doesn't point to a board.</p>
        <div className="home-cta">
          <button type="button" className="primary" onClick={() => navigate('/')}>
            Go to the home page
          </button>
        </div>
      </main>
    </div>
  )
}
