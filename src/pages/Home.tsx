import { useState } from 'react'
import { boardIdForKey, newEditKey } from '../../shared/boardKey'
import { Logo } from '../components/icons'
import { ThemeToggle } from '../components/ThemeToggle'
import { forgetBoard, loadRecentBoards, timeAgo } from '../lib/recentBoards'
import { boardPath, navigate } from '../lib/router'

const REPO_URL = 'https://github.com/adamchebil33/inkspace'

/** Boards need no server call to exist: pick a key, derive the id, go there. */
async function createBoard(): Promise<void> {
  const editKey = newEditKey()
  navigate(boardPath(await boardIdForKey(editKey), editKey))
}

export function Home() {
  const [boards, setBoards] = useState(loadRecentBoards)

  return (
    <div className="home">
      <main className="home-main">
        <div className="wordmark">
          <Logo size={36} />
          <span>Inkspace</span>
          <ThemeToggle />
        </div>

        <h1>A whiteboard for thinking together.</h1>
        <p className="lede">
          Sticky notes, shapes, arrows and a pen on an endless canvas. Share the link and everyone
          edits live. No sign-up.
        </p>

        <div className="home-cta">
          <button type="button" className="primary" onClick={() => void createBoard()}>
            New board
          </button>
          <span className="hint">Tip: open your board in two windows to watch them sync.</span>
        </div>

        <Preview />

        {boards.length > 0 && (
          <section aria-labelledby="recent-heading">
            <h2 id="recent-heading">Your recent boards</h2>
            <ul className="board-list">
              {boards.map((board) => (
                <li key={board.id}>
                  <a
                    href={boardPath(board.id, board.editKey)}
                    className="board-card"
                    onClick={(e) => {
                      e.preventDefault()
                      navigate(boardPath(board.id, board.editKey))
                    }}
                  >
                    <strong>{board.title || 'Untitled board'}</strong>
                    <small>
                      {board.editKey ? 'Can edit' : 'View only'} · opened {timeAgo(board.openedAt)}
                    </small>
                  </a>
                  <button
                    type="button"
                    className="forget"
                    aria-label={`Remove ${board.title || 'Untitled board'} from this list`}
                    title="Remove from this list"
                    onClick={() => {
                      forgetBoard(board.id)
                      setBoards(loadRecentBoards())
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <p className="hint">
              This list lives in your browser. Removing a board here doesn't delete it.
            </p>
          </section>
        )}
      </main>

      <footer className="home-footer">
        Built with React, Yjs and Cloudflare Durable Objects ·{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </footer>
    </div>
  )
}

/** A small static picture of a board in use, so the page isn't just words. */
function Preview() {
  return (
    <svg
      className="preview"
      viewBox="0 0 640 260"
      role="img"
      aria-label="Two people editing a board"
    >
      <rect width="640" height="260" rx="14" fill="var(--panel)" stroke="var(--panel-border)" />
      <g fontFamily="inherit" fontSize="13" fill="#1c1c1a" textAnchor="middle">
        <rect x="60" y="56" width="130" height="130" rx="3" fill="#ffe066" />
        <text x="125" y="118">
          Interview
        </text>
        <text x="125" y="136">
          five users
        </text>
        <rect
          x="255"
          y="76"
          width="150"
          height="90"
          rx="8"
          fill="#a5d8ff"
          stroke="#1c7ed6"
          strokeWidth="2"
        />
        <text x="330" y="126">
          Prototype
        </text>
        <rect x="470" y="56" width="130" height="130" rx="3" fill="#fcc2d7" />
        <text x="535" y="118">
          Ship it
        </text>
        <text x="535" y="136">
          on Friday
        </text>
      </g>
      <g stroke="var(--fg)" strokeWidth="2.5" strokeLinecap="round" fill="none">
        <path d="M198 121h48m-10-8 10 8-10 8" />
        <path d="M413 121h48m-10-8 10 8-10 8" />
      </g>
      <path
        d="M250 215c20-22 40-22 60 0s40 22 60 0"
        fill="none"
        stroke="#e03131"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <Cursor x={372} y={196} color="#d6336c" name="Ada" />
      <Cursor x={560} y={150} color="#2f9e44" name="Grace" />
    </svg>
  )
}

function Cursor({ x, y, color, name }: { x: number; y: number; color: string; name: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M0 0v17l4.6-4.4h6.9z"
        fill={color}
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect x="12" y="16" width={name.length * 7.5 + 12} height="20" rx="6" fill={color} />
      <text x="18" y="30" fontSize="12" fontWeight="500" fill="#fff">
        {name}
      </text>
    </g>
  )
}
