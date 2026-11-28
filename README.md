# Inkspace

**A multiplayer whiteboard: share a link and everyone edits the same board live.**

**Live demo:** https://inkspace.adamchebil.workers.dev (open it in two windows to see live sync)

https://github.com/user-attachments/assets/3cc4d2e4-c7b1-4ac7-92f7-beca76636077

Sticky notes, shapes, arrows, a pen and text on an endless canvas. No sign-up: a board is
a link. Everyone on it sees each other's cursors and edits as they happen, edits made
offline merge when the connection returns, and undo only reverts your own changes.

## Features

- **Live collaboration.** Everyone's cursors and edits, even half-drawn pen strokes, show up
  for everyone as they happen.
- **Works offline.** Keep drawing when the connection drops; your changes merge when it comes
  back. Two people can even type in the same note at once without losing a word.
- **No accounts.** Send an edit link or a view-only link. The board's creator can reset the
  edit link at any time to cut off everyone using the old one.
- **AI summary.** One click turns the board's notes into a summary, themes and action items,
  and drops the action items onto the board as sticky notes.
- **Follow mode.** Click someone's avatar and your view follows theirs as they pan and zoom.
- **A complete canvas editor.** Sticky notes, shapes, arrows that stay attached, a pen and
  formatted text, with smart guides, templates, per-person undo, dark mode and PNG export.

## Highlights

- **Real-time sync, built by hand.** A CRDT ([Yjs](https://yjs.dev)) keeps every copy of a
  board identical, with my own WebSocket sync client and server instead of a ready-made sync
  service.
- **The canvas editor is written from scratch.** No whiteboard SDK and no canvas library:
  rendering, hit-testing, snapping and every gesture are my own code, and unit tested.
- **Access control without accounts.** Edit and view-only links are derived from a secret key
  with one-way hashes, so the server can check them without storing who may do what.
- **Runs for $0.** Everything is on Cloudflare's free plan. Batched saves, throttled updates
  and boards that sleep when idle keep it within the free limits.
- **Tested like a team would use it.** 225 unit tests, plus 35 browser tests that open one
  board in several windows, as several people, and check they stay in sync.

## Tech stack

| Area      | Tools                                       |
| --------- | ------------------------------------------- |
| Frontend  | React, TypeScript, Vite, Canvas 2D          |
| Real-time | Yjs (CRDT), WebSockets                      |
| Backend   | Cloudflare Workers, Durable Objects, SQLite |
| AI        | Gemini API                                  |
| Testing   | Vitest, Playwright                          |

## Run it locally

Requires Node.js 22 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars   # turns on a mock AI summary, no key needed
npm run dev
```

Open http://localhost:5173, create a board and open its link in a second window.

## License

[MIT](LICENSE)
