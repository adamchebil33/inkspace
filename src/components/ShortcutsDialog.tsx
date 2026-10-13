import { useEffect, useRef } from 'react'
import { CloseIcon } from './icons'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

const GROUPS: { title: string; rows: [keys: string[], action: string][] }[] = [
  {
    title: 'Tools',
    rows: [
      [['V'], 'Select'],
      [['H'], 'Pan'],
      [['S'], 'Sticky note'],
      [['R'], 'Rectangle'],
      [['O'], 'Ellipse'],
      [['A'], 'Arrow'],
      [['P'], 'Pen'],
      [['T'], 'Text'],
    ],
  },
  {
    title: 'Editing',
    rows: [
      [[mod, 'Z'], 'Undo'],
      [[mod, 'Shift', 'Z'], 'Redo'],
      [[mod, 'D'], 'Duplicate'],
      [[mod, 'A'], 'Select all'],
      [['Delete'], 'Delete selection'],
      [['Arrows'], 'Nudge (Shift for more)'],
      [[mod, 'drag'], 'Move or resize without snapping'],
      [[']'], 'Bring to front'],
      [['['], 'Send to back'],
      [['Esc'], 'Deselect or stop editing'],
    ],
  },
  {
    title: 'View',
    rows: [
      [['Space', 'drag'], 'Pan'],
      [['Scroll'], 'Pan'],
      [[mod, 'scroll'], 'Zoom'],
      [['Shift', '1'], 'Zoom to fit'],
      [['Double-click'], 'Edit text, or new sticky note'],
    ],
  },
]

/** A modal list of keyboard shortcuts, using the native <dialog> element. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="shortcuts"
      aria-label="Keyboard shortcuts"
      onClose={onClose}
      // Clicking the backdrop (the dialog element itself) closes it.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="shortcuts-content">
        <header>
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="tool" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="shortcut-groups">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <dl>
                {group.rows.map(([keys, action]) => (
                  <div key={action}>
                    <dt>
                      {keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </dt>
                    <dd>{action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </dialog>
  )
}
