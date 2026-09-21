import * as Y from 'yjs'

const MAX_NOTES = 200
const MAX_NOTE_LENGTH = 500
const MAX_TOTAL_LENGTH = 12_000

/**
 * The text on a board, for the AI summary: sticky notes first (they are the
 * point of the feature), then text in shapes and free text. Capped so one
 * huge board cannot run up a large model bill.
 */
export function collectNotes(doc: Y.Doc): string[] {
  const stickies: string[] = []
  const others: string[] = []

  doc.getMap<Y.Map<unknown>>('shapes').forEach((shape) => {
    // Text is a Y.Text; boards saved by older versions hold a plain string.
    const value = shape.get('text')
    const text = value instanceof Y.Text ? value.toString() : value
    if (typeof text !== 'string') return
    // Collapse whitespace so a note is always a single line in the prompt.
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_LENGTH)
    if (clean) (shape.get('type') === 'sticky' ? stickies : others).push(clean)
  })

  const notes: string[] = []
  let total = 0
  for (const note of [...stickies, ...others]) {
    if (notes.length >= MAX_NOTES || total + note.length > MAX_TOTAL_LENGTH) break
    notes.push(note)
    total += note.length
  }
  return notes
}
