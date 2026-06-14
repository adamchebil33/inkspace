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

const people = (page: Page) =>
  page.getByRole('list', { name: 'People on this board' }).getByRole('listitem')

const peers = (page: Page) =>
  page.evaluate(() =>
    window.presence!.getState().peers.map(({ name, cursor }) => ({ name, cursor })),
  )

test('shows who is online and where their cursor is', async ({ browser }) => {
  const url = newBoardUrl()
  const alice = await openBoard(browser, url)
  await expect(people(alice)).toHaveCount(1)

  const bob = await openBoard(browser, url)
  await expect(people(alice)).toHaveCount(2)
  await expect(people(bob)).toHaveCount(2)

  // Alice renames herself; Bob sees the new name.
  await alice.getByRole('button', { name: /\(you\)/ }).click()
  await alice.getByRole('textbox', { name: 'Your name' }).fill('Alice')
  await alice.keyboard.press('Enter')
  await expect(bob.getByRole('button', { name: 'Alice' })).toBeVisible()

  // Alice moves her mouse; Bob receives the same world position.
  await alice.mouse.move(420, 310, { steps: 4 })
  const expected = await alice.evaluate(() => window.editor!.getPointerWorld())
  await expect.poll(() => peers(bob)).toEqual([{ name: 'Alice', cursor: expected }])

  // Alice leaves; her avatar and cursor disappear for Bob.
  await alice.context().close()
  await expect(people(bob)).toHaveCount(1)
  expect(await peers(bob)).toEqual([])
})

test('says so when the connection drops, and recovers', async ({ browser }) => {
  const page = await openBoard(browser, newBoardUrl())
  await expect(page.getByRole('status')).toHaveCount(0)

  // Cut the connection for real. (Playwright's offline mode leaves open
  // WebSockets alone, so it would not exercise this.)
  await page.evaluate(() => window.sync!.disconnect())
  await expect(page.getByRole('status')).toContainText('Offline')

  await page.evaluate(() => window.sync!.connect())
  await expect(page.getByRole('status')).toHaveCount(0)
})
