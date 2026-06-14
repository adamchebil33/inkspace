import { expect, test, type Browser, type Page } from '@playwright/test'

/** A fresh board per test, so tests never see each other's shapes. */
const newBoardUrl = () =>
  `/b/e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** Each person gets their own browser context: separate storage, separate socket. */
async function openBoard(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(url)
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible()
  return page
}

/** The board is a canvas, so read shapes from the editor instead of the DOM. */
const shapes = (page: Page) =>
  page.evaluate(() =>
    window.editor!.store.list().map(({ type, text, x, y }) => ({ type, text, x, y })),
  )

async function addSticky(page: Page, x: number, y: number, text: string) {
  await page.getByRole('button', { name: 'Sticky note' }).click()
  await page.mouse.click(x, y)
  await page.keyboard.type(text)
  await page.keyboard.press('Escape')
}

async function dragMouse(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from)
  await page.mouse.down()
  await page.mouse.move(...to, { steps: 5 })
  await page.mouse.up()
}

test('a change in one window shows up in the other', async ({ browser }) => {
  const url = newBoardUrl()
  const alice = await openBoard(browser, url)
  const bob = await openBoard(browser, url)

  await addSticky(alice, 400, 300, 'Hello from Alice')
  await expect.poll(() => shapes(bob)).toMatchObject([{ type: 'sticky', text: 'Hello from Alice' }])

  // And the other way: Bob drags the note, Alice sees it move.
  const [before] = await shapes(alice)
  await dragMouse(bob, [400, 300], [550, 380])
  await expect.poll(() => shapes(alice)).toMatchObject([{ x: before!.x + 150, y: before!.y + 80 }])

  // Bob deletes it (still selected from the drag); it disappears for Alice.
  await bob.keyboard.press('Delete')
  await expect.poll(() => shapes(alice)).toEqual([])
})

test('someone who joins later gets the whole board', async ({ browser }) => {
  const url = newBoardUrl()
  const alice = await openBoard(browser, url)
  await addSticky(alice, 300, 300, 'First')
  await addSticky(alice, 600, 300, 'Second')

  // Wait until the server has it, then have everyone leave.
  const probe = await openBoard(browser, url)
  await expect.poll(() => shapes(probe)).toHaveLength(2)
  await alice.context().close()
  await probe.context().close()

  const bob = await openBoard(browser, url)
  await expect
    .poll(async () => (await shapes(bob)).map((s) => s.text).sort())
    .toEqual(['First', 'Second'])
})

test('edits made offline are merged after reconnecting', async ({ browser }) => {
  const url = newBoardUrl()
  const alice = await openBoard(browser, url)
  const bob = await openBoard(browser, url)
  await addSticky(alice, 300, 300, 'Shared')
  await expect.poll(() => shapes(bob)).toHaveLength(1)

  // Bob loses his connection; both keep working. (Playwright's offline mode
  // leaves open WebSockets alone, so close the socket itself.)
  await bob.evaluate(() => window.sync!.disconnect())
  await addSticky(bob, 600, 300, 'Written offline')
  await addSticky(alice, 300, 550, 'Written meanwhile')
  expect(await shapes(alice)).toHaveLength(2)
  expect(await shapes(bob)).toHaveLength(2)

  await bob.evaluate(() => window.sync!.connect())
  const expected = ['Shared', 'Written meanwhile', 'Written offline']
  for (const page of [alice, bob]) {
    await expect.poll(async () => (await shapes(page)).map((s) => s.text).sort()).toEqual(expected)
  }
})
