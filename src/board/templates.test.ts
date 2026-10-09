import { describe, expect, it } from 'vitest'
import { BoardStore } from './store'
import { TEMPLATES, TEMPLATE_IDS, applyTemplate, buildTemplate, isTemplateId } from './templates'

const measure = (text: string) => text.length * 8

describe('templates', () => {
  it('has a description for every template id', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([...TEMPLATE_IDS])
    expect(isTemplateId('retro')).toBe(true)
    expect(isTemplateId('nope')).toBe(false)
    expect(isTemplateId(undefined)).toBe(false)
  })

  it.each(TEMPLATE_IDS)('%s builds valid shapes that survive a round trip', (id) => {
    const shapes = buildTemplate(id, measure)
    expect(shapes.length).toBeGreaterThan(3)

    // Every attached arrow points at shapes that exist.
    const ids = new Set(shapes.map((s) => s.id))
    for (const arrow of shapes.filter((s) => s.type === 'arrow')) {
      expect(ids.has(arrow.startId!)).toBe(true)
      expect(ids.has(arrow.endId!)).toBe(true)
    }

    // Nothing is dropped by the store's validation.
    const store = new BoardStore()
    for (const shape of shapes) store.add(shape)
    expect(store.list()).toHaveLength(shapes.length)
  })

  it('gives fresh ids every time', () => {
    const a = buildTemplate('kanban', measure).map((s) => s.id)
    const b = buildTemplate('kanban', measure).map((s) => s.id)
    expect(a.filter((id) => b.includes(id))).toEqual([])
  })

  it('fills the board and sets the title, without an undo step', () => {
    const store = new BoardStore()
    applyTemplate(store, 'retro', measure)
    expect(store.getTitle()).toBe('Retrospective')
    expect(store.list().some((s) => s.text === 'Went well')).toBe(true)
    expect(store.canUndo()).toBe(false)
  })

  it('does nothing on a read-only board', () => {
    const store = new BoardStore(undefined, { readOnly: true })
    applyTemplate(store, 'brainstorm', measure)
    expect(store.list()).toEqual([])
  })
})
