import type { SummaryResponse } from '../../shared/summary'

/**
 * Ask the server for an AI summary of a board. Always resolves: any network
 * or server problem becomes a `failed` result the UI can show.
 */
export async function requestSummary(boardId: string): Promise<SummaryResponse> {
  try {
    const response = await fetch(`/api/boards/${boardId}/summary`, { method: 'POST' })
    const body = (await response.json()) as SummaryResponse
    if (typeof body?.ok === 'boolean') return body
  } catch {
    // Offline, or the reply wasn't JSON.
  }
  return { ok: false, error: 'failed' }
}
