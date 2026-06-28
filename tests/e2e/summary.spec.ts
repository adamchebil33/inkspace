import { expect, test } from '@playwright/test'
import type { SummaryResponse } from '../../shared/summary'
import { addSticky, newBoard, openBoard, shapes } from './helpers'

// These run against the real endpoint. Locally and in CI the server uses
// GEMINI_API_KEY=mock (see .dev.vars.example), which returns a canned summary
// without calling any AI service.

test('summarizes the board and turns action items into sticky notes', async ({ browser }) => {
  const page = await openBoard(browser, (await newBoard()).edit)
  await addSticky(page, 300, 300, 'Interview five users')
  await addSticky(page, 560, 300, 'Fix the signup bug')

  // The server summarizes its own copy of the board, so wait until the notes
  // have reached it. A second visitor seeing them proves that.
  const probe = await openBoard(browser, page.url())
  await expect.poll(() => shapes(probe)).toHaveLength(2)

  await page.getByRole('button', { name: 'Summarize board' }).click()
  const panel = page.getByRole('complementary', { name: 'Board summary' })
  await expect(panel.getByText(/This board has 2 notes/)).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'Action items' })).toBeVisible()

  await panel.getByRole('button', { name: 'Add as sticky notes' }).click()
  await expect(panel.getByRole('button', { name: 'Added to the board' })).toBeDisabled()
  // The new notes are real shapes: the other visitor gets them too.
  await expect
    .poll(async () => (await shapes(probe)).map((s) => s.text).sort())
    .toEqual([
      'Fix the signup bug',
      'Follow up: Fix the signup bug',
      'Follow up: Interview five users',
      'Interview five users',
    ])

  // One undo removes the whole batch.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => shapes(probe)).toHaveLength(2)
})

test('explains an empty board instead of calling the AI', async ({ browser }) => {
  const page = await openBoard(browser, (await newBoard()).edit)
  await page.getByRole('button', { name: 'Summarize board' }).click()
  await expect(page.getByRole('alert')).toContainText('nothing to summarize')
})

test('limits how often a board can be summarized', async ({ browser }) => {
  const page = await openBoard(browser, (await newBoard()).edit)
  await addSticky(page, 300, 300, 'First note')
  const probe = await openBoard(browser, page.url())
  await expect.poll(() => shapes(probe)).toHaveLength(1)

  const summarize = async () => {
    const response = await page.request.post(
      `${new URL(page.url()).pathname.replace('/b/', '/api/boards/')}/summary`,
    )
    return { status: response.status(), body: (await response.json()) as SummaryResponse }
  }

  expect((await summarize()).status).toBe(200)
  // Unchanged board: the cached answer is free, so it is not limited.
  expect((await summarize()).status).toBe(200)

  // Changed board, asked again right away: told to wait.
  await addSticky(page, 560, 300, 'Second note')
  await expect.poll(() => shapes(probe)).toHaveLength(2)
  const limited = await summarize()
  expect(limited.status).toBe(429)
  expect(limited.body).toMatchObject({ ok: false, error: 'rate_limited' })
})

test('keeps the board usable when the AI is unavailable', async ({ browser }) => {
  const page = await openBoard(browser, (await newBoard()).edit)
  await page.route('**/api/boards/*/summary', (route) =>
    route.fulfill({ status: 503, json: { ok: false, error: 'not_configured' } }),
  )
  await page.getByRole('button', { name: 'Summarize board' }).click()
  await expect(page.getByRole('alert')).toContainText('not set up')

  await page.getByRole('button', { name: 'Close summary' }).click()
  await addSticky(page, 300, 300, 'Still works')
  expect(await shapes(page)).toMatchObject([{ text: 'Still works' }])
})
