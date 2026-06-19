import { expect, test, type Browser, type Page } from '@playwright/test'

const newBoardUrl = () =>
  `/b/e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

async function openBoard(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(url)
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible()
  return page
}

const types = (page: Page) =>
  page.evaluate(() =>
    window
      .editor!.store.list()
      .map((s) => s.type)
      .sort(),
  )

const peerDraftLength = (page: Page) =>
  page.evaluate(() => window.presence!.getState().peers[0]?.draft?.points.length ?? 0)

test('a pen stroke is visible to others while it is being drawn', async ({ browser }) => {
  const url = newBoardUrl()
  const alice = await openBoard(browser, url)
  const bob = await openBoard(browser, url)

  await alice.getByRole('button', { name: 'Pen' }).click()
  await alice.mouse.move(300, 300)
  await alice.mouse.down()
  await alice.mouse.move(500, 380, { steps: 12 })

  // Not released yet: nothing is saved, but Bob already sees the line.
  await expect.poll(() => peerDraftLength(bob)).toBeGreaterThan(2)
  expect(await types(bob)).toEqual([])

  await alice.mouse.up()
  await expect.poll(() => types(bob)).toEqual(['pen'])
  await expect.poll(() => peerDraftLength(bob)).toBe(0)
})

test('undo only reverts your own changes', async ({ browser }) => {
  const url = newBoardUrl()
  const alice = await openBoard(browser, url)
  const bob = await openBoard(browser, url)

  await alice.getByRole('button', { name: 'Rectangle' }).click()
  await alice.mouse.click(300, 300)
  await bob.getByRole('button', { name: 'Ellipse' }).click()
  await bob.mouse.click(700, 300)
  await expect.poll(() => types(alice)).toEqual(['ellipse', 'rect'])

  // Bob's ellipse is the most recent change, but Alice's undo skips it.
  await alice.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => types(bob)).toEqual(['ellipse'])
  await expect(alice.getByRole('button', { name: 'Undo' })).toBeDisabled()

  await alice.getByRole('button', { name: 'Redo' }).click()
  await expect.poll(() => types(bob)).toEqual(['ellipse', 'rect'])
})
