import { useState } from 'react'
import { boardIdForOwner, newOwnerKey } from '../../shared/boardKey'
import { TEMPLATES, type TemplateId } from '../board/templates'
import { ArrowRightIcon, CloseIcon, ExternalIcon, Logo } from '../components/icons'
import { DemoVideo } from '../components/DemoVideo'
import { HeroDemo } from '../components/HeroDemo'
import { TemplatePreview } from '../components/TemplatePreview'
import { ThemeToggle } from '../components/ThemeToggle'
import { MAX_NAME_LENGTH, cleanName, initials, loadUser, saveUser } from '../lib/identity'
import { forgetBoard, loadRecentBoards, rememberBoard, timeAgo } from '../lib/recentBoards'
import { boardPath, navigate } from '../lib/router'
import './Home.css'

const REPO_URL = 'https://github.com/adamchebil33/inkspace'

/**
 * Boards need no server call to exist: pick an owner key, derive the id, go
 * there. The key is saved in this browser, which makes this browser the
 * board's owner. It only goes into the address if it could not be saved.
 */
async function createBoard(template?: TemplateId): Promise<void> {
  const ownerKey = newOwnerKey()
  const id = await boardIdForOwner(ownerKey)
  const saved = rememberBoard({ id, key: ownerKey, role: 'owner', title: '' })
  navigate(boardPath(id, saved ? null : ownerKey), template ? { template } : null)
}

const ROLE_LABEL = { owner: 'Owner', editor: 'Can edit', viewer: 'View only' } as const

export function Home() {
  const [boards, setBoards] = useState(loadRecentBoards)

  // Everyone gets a random name and colour on their first visit. It is shown
  // here so it can be changed before joining a board, or simply kept.
  const [user] = useState(loadUser)
  const [name, setName] = useState(user.name)
  const rename = (value: string) => {
    setName(value)
    // Saved as you type, so it applies however you open a board next.
    if (cleanName(value)) saveUser({ ...user, name: cleanName(value) })
  }

  return (
    <div className="home">
      <header className="home-header">
        <a
          href="/"
          className="home-brand"
          onClick={(e) => {
            e.preventDefault()
            navigate('/')
          }}
        >
          <Logo size={30} />
          <span>Inkspace</span>
        </a>
        <nav className="home-nav" aria-label="Site">
          <a href={REPO_URL} className="home-nav-link" target="_blank" rel="noreferrer">
            Source code
            <ExternalIcon />
          </a>
          <ThemeToggle />
        </nav>
      </header>

      <main className="home-main">
        <section className="hero" aria-labelledby="hero-heading">
          <div className="hero-copy">
            <h1 id="hero-heading">
              Send a link.
              <br />
              Draw <span className="marker">together.</span>
            </h1>
            <p className="lede">
              A whiteboard that lives at a web address. Sticky notes, shapes, arrows and a pen, with
              everyone's cursors and edits showing up as they happen. No account, nothing to
              install.
            </p>

            <form
              className="start"
              onSubmit={(e) => {
                e.preventDefault()
                void createBoard()
              }}
            >
              <label className="name-field">
                <span className="avatar" style={{ background: user.color }} aria-hidden="true">
                  {initials(name)}
                </span>
                <span className="name-label">Your name</span>
                <input
                  className="name-input"
                  maxLength={MAX_NAME_LENGTH}
                  value={name}
                  onChange={(e) => rename(e.target.value)}
                  // Left empty: fall back to the name we had.
                  onBlur={() => setName(loadUser().name)}
                />
              </label>
              <button type="submit" className="primary">
                New board
                <ArrowRightIcon />
              </button>
            </form>
            <p className="start-note">
              This is the name others will see. Tip: open your board in two windows to watch them
              sync.
            </p>
          </div>

          <figure className="hero-demo">
            <HeroDemo />
            <figcaption>Ada and Grace on one board, drawn by the app's own renderer.</figcaption>
          </figure>
        </section>

        <section className="home-section" aria-labelledby="tour-heading">
          <div className="section-head">
            <h2 id="tour-heading" className="tour-heading">
              Watch the demo
            </h2>
          </div>
          <DemoVideo />
        </section>

        <section className="home-section" aria-labelledby="templates-heading">
          <div className="section-head">
            <h2 id="templates-heading">Start from a template</h2>
            <p>Opens a new board with this already on it.</p>
          </div>
          <ul className="template-list">
            {TEMPLATES.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  className="template-card"
                  aria-label={`New ${template.name} board`}
                  onClick={() => void createBoard(template.id)}
                >
                  <TemplatePreview id={template.id} />
                  <strong>{template.name}</strong>
                  <small>{template.description}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {boards.length > 0 && (
          <section className="home-section" aria-labelledby="recent-heading">
            <div className="section-head">
              <h2 id="recent-heading">Your recent boards</h2>
            </div>
            <ul className="board-list">
              {boards.map((board) => (
                <li key={board.id}>
                  <a
                    href={boardPath(board.id)}
                    className="board-row"
                    onClick={(e) => {
                      e.preventDefault()
                      navigate(boardPath(board.id))
                    }}
                  >
                    <strong>{board.title || 'Untitled board'}</strong>
                    <span className={`role role-${board.role}`}>{ROLE_LABEL[board.role]}</span>
                    <small>Opened {timeAgo(board.openedAt)}</small>
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
                    <CloseIcon />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="home-footer">
        <span>Built with React, Yjs and Cloudflare Durable Objects.</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </footer>
    </div>
  )
}
