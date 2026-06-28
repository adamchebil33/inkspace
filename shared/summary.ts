// The AI summary of a board: types shared by the Worker and the browser.

export interface Theme {
  title: string
  /** The notes (quoted or lightly paraphrased) that belong to this theme. */
  notes: string[]
}

export interface BoardSummary {
  summary: string
  themes: Theme[]
  actionItems: string[]
}

export type SummaryError =
  /** The board has no text to summarize. */
  | 'empty'
  /** No API key on this server. Everything else still works. */
  | 'not_configured'
  /** Too many requests, from this board, this visitor, or the AI quota. */
  | 'rate_limited'
  /** The AI service failed or returned something unusable. */
  | 'failed'

export type SummaryResponse =
  | { ok: true; summary: BoardSummary }
  | { ok: false; error: SummaryError; retryAfterSeconds?: number }

const MAX_THEMES = 8
const MAX_ITEMS = 12

const text = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const texts = (value: unknown, maxItems: number, maxLength: number): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => text(item, maxLength))
        .filter(Boolean)
        .slice(0, maxItems)
    : []

/**
 * Turn whatever the model returned into a well-formed summary, or null if it
 * is unusable. Model output is untrusted input like any other.
 */
export function parseSummary(value: unknown): BoardSummary | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>

  const summary = text(raw.summary, 1200)
  if (!summary) return null

  const themes = (Array.isArray(raw.themes) ? raw.themes : [])
    .map((theme): Theme | null => {
      if (typeof theme !== 'object' || theme === null) return null
      const { title, notes } = theme as Record<string, unknown>
      const cleanTitle = text(title, 80)
      return cleanTitle ? { title: cleanTitle, notes: texts(notes, MAX_ITEMS, 200) } : null
    })
    .filter((theme): theme is Theme => theme !== null)
    .slice(0, MAX_THEMES)

  return { summary, themes, actionItems: texts(raw.actionItems, MAX_ITEMS, 160) }
}
