import { expect, test, type Page } from '@playwright/test'
import { addSticky, newBoard, openBoard, shapes } from './helpers'

const fullNotice = (page: Page) => page.getByText('This board has reached its size limit')

/**
 * Add about half a megabyte to the board in one edit, bypassing the UI the
 * way a modified client could. (Plain text in the board's settings map: the
 * app ignores it, but it counts towards the board's size.)
 */
const addJunk = (page: Page, n: number) =>
  page.evaluate((n) => {
    window.editor!.store.doc.getMap('meta').set(`junk-${n}`, 'x'.repeat(500_000))
  }, n)

test('a board that reaches its size limit becomes read-only for everyone', async ({ browser }) => {
  test.setTimeout(60_000)
  const board = await newBoard()
  const alice = await openBoard(browser, board.edit)
  const bob = await openBoard(browser, board.edit)
  await addSticky(alice, 400, 300, 'Before')
  await expect.poll(() => shapes(bob)).toHaveLength(1)

  // The limit is 2 MB; five half-megabyte edits cross it.
  for (let n = 0; n < 5; n++) {
    await addJunk(alice, n)
    await alice.waitForTimeout(200)
  }

  for (const page of [alice, bob]) {
    await expect(fullNotice(page)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('toolbar', { name: 'Tools' })).toHaveCount(0)
    // The board itself is still there to look at.
    await expect.poll(() => shapes(page)).toMatchObject([{ text: 'Before' }])
  }

  // A write that bypasses the UI is refused by the server.
  await bob.evaluate(() => {
    window.editor!.store.doc.getMap('meta').set('title', 'Sneaked in')
  })
  await bob.waitForTimeout(500)
  const late = await bob.context().browser()!.newContext()
  const fresh = await late.newPage()
  await fresh.goto(board.edit)
  await expect(fullNotice(fresh)).toBeVisible({ timeout: 15_000 })
  await expect(fresh.getByRole('textbox', { name: 'Board title' })).not.toHaveValue('Sneaked in')
})

test('a board well under the limit is unaffected', async ({ browser }) => {
  const page = await openBoard(browser, (await newBoard()).edit)
  await addJunk(page, 0)
  await addSticky(page, 400, 300, 'Still editable')
  await expect.poll(() => shapes(page)).toHaveLength(1)
  await expect(fullNotice(page)).toHaveCount(0)
})
