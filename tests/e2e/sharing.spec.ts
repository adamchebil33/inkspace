import { expect, test } from '@playwright/test'
import { addSticky, newBoard, openBoard, shapes } from './helpers'

test('a view-only link shows the board live but cannot change it', async ({ browser }) => {
  const board = await newBoard()
  const editor = await openBoard(browser, board.edit)
  const viewer = await openBoard(browser, board.view)

  // The viewer has no tools, and says so.
  await expect(viewer.getByText('View only')).toBeVisible()
  await expect(viewer.getByRole('toolbar', { name: 'Tools' })).toHaveCount(0)
  await expect(viewer.getByRole('textbox', { name: 'Board title' })).not.toBeEditable()

  // Edits still arrive live.
  await addSticky(editor, 400, 300, 'Read me')
  await expect.poll(() => shapes(viewer)).toMatchObject([{ text: 'Read me' }])

  // Dragging and the keyboard do nothing to the document.
  await viewer.mouse.move(400, 300)
  await viewer.mouse.down()
  await viewer.mouse.move(600, 400, { steps: 4 })
  await viewer.mouse.up()
  await viewer.keyboard.press('Control+a')
  await viewer.keyboard.press('Delete')
  await editor.waitForTimeout(300)
  expect(await shapes(editor)).toHaveLength(1)
})

test('the server refuses writes from a view-only connection', async ({ browser }) => {
  const board = await newBoard()
  const editor = await openBoard(browser, board.edit)
  const viewer = await openBoard(browser, board.view)
  await addSticky(editor, 400, 300, 'Original')
  await expect.poll(() => shapes(viewer)).toHaveLength(1)

  // Bypass the UI entirely and write straight into the viewer's document, as
  // a modified client could. The update is sent, and the server drops it.
  await viewer.evaluate(() => {
    const doc = window.editor!.store.doc
    const shape = doc.getMap('shapes').values().next().value as { set(k: string, v: unknown): void }
    doc.transact(() => shape.set('text', 'Defaced'))
  })
  expect(await shapes(viewer)).toMatchObject([{ text: 'Defaced' }])

  // A later edit from the real editor proves the connection is still flowing.
  await addSticky(editor, 700, 300, 'Second')
  await expect.poll(() => shapes(viewer)).toHaveLength(2)
  expect((await shapes(editor)).map((s) => s.text).sort()).toEqual(['Original', 'Second'])
})

test('a wrong key does not grant edit access', async ({ browser }) => {
  const board = await newBoard()
  const other = await newBoard()
  const wrongKey = other.edit.split('#')[1]
  const page = await openBoard(browser, `${board.view}#${wrongKey}`)
  await expect(page.getByText('View only')).toBeVisible()
})

test('creating a board from the home page and finding it again', async ({ browser }) => {
  const context = await browser.newContext()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText())
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('whiteboard')
  await expect(page.getByRole('heading', { name: 'Your recent boards' })).toHaveCount(0)

  // The creator's address carries no secret, so it is safe to pass around.
  await page.getByRole('button', { name: 'New board' }).click()
  await expect(page).toHaveURL(/\/b\/[\w-]+$/)
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible()
  const viewUrl = page.url()

  await page.getByRole('textbox', { name: 'Board title' }).fill('Sprint planning')
  await expect(page).toHaveTitle('Sprint planning · Inkspace')

  // The share menu hands out each kind of link.
  await page.getByRole('button', { name: 'Share' }).click()
  await page.getByRole('button', { name: /Copy view-only link/ }).click()
  expect(await clipboard()).toBe(viewUrl)
  await page.getByRole('button', { name: /Copy edit link/ }).click()
  const editUrl = await clipboard()
  expect(editUrl).toMatch(new RegExp(`^${viewUrl}#[\\w-]+$`))
  await page.getByRole('button', { name: /Copy owner link/ }).click()
  const ownerUrl = await clipboard()
  expect(ownerUrl).toMatch(new RegExp(`^${viewUrl}#[\\w-]+$`))
  expect(ownerUrl).not.toBe(editUrl)
  await page.keyboard.press('Escape')

  // Someone given the edit link can edit, but cannot reset links.
  const guest = await openBoard(browser, editUrl)
  await expect(guest.getByRole('toolbar', { name: 'Tools' })).toBeVisible()
  await guest.getByRole('button', { name: 'Share' }).click()
  await expect(guest.getByRole('button', { name: /Copy edit link/ })).toBeVisible()
  await expect(guest.getByRole('button', { name: /Reset edit link/ })).toHaveCount(0)

  // Back on the home page the board is listed, and opens with full access.
  await page.getByRole('link', { name: 'All boards' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: /Sprint planning/ })).toContainText('Owner')
  await page.getByRole('link', { name: /Sprint planning/ }).click()
  await expect(page).toHaveURL(viewUrl)
  await expect(page.getByRole('textbox', { name: 'Board title' })).toHaveValue('Sprint planning')
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible()

  // The owner stays the owner even when opening their board by an edit link.
  await page.goto(editUrl)
  await page.getByRole('button', { name: 'Share' }).click()
  await expect(page.getByRole('button', { name: /Reset edit link/ })).toBeVisible()
})

test('an owner link opened on another device gives full control and hides the key', async ({
  browser,
}) => {
  const board = await newBoard()
  const page = await openBoard(browser, board.owner)
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible()
  // Once saved in this browser, the owner key leaves the address bar.
  await expect(page).toHaveURL(new RegExp(`${board.view}$`))
  await page.reload()
  await page.getByRole('button', { name: 'Share' }).click()
  await expect(page.getByRole('button', { name: /Reset edit link/ })).toBeVisible()
})

test('resetting the edit link cuts off everyone using the old one', async ({ browser }) => {
  const board = await newBoard()
  const ownerContext = await browser.newContext()
  await ownerContext.grantPermissions(['clipboard-read', 'clipboard-write'])
  const owner = await ownerContext.newPage()
  await owner.goto(board.owner)
  await expect(owner.getByRole('toolbar', { name: 'Tools' })).toBeVisible()

  const guest = await openBoard(browser, board.edit)
  await addSticky(guest, 400, 300, 'From the guest')
  await expect.poll(() => shapes(owner)).toHaveLength(1)

  // The owner resets the link (two clicks: ask, then confirm).
  await owner.getByRole('button', { name: 'Share' }).click()
  await owner.getByRole('button', { name: /Reset edit link/ }).click()
  await owner.getByRole('button', { name: /Click again to confirm/ }).click()
  await expect(owner.getByText('Old edit links are now view-only')).toBeVisible()

  // The guest, still connected, becomes view-only on the spot.
  await expect(guest.getByText('View only')).toBeVisible()
  await expect(guest.getByRole('toolbar', { name: 'Tools' })).toHaveCount(0)
  // They keep seeing the board, including what they added, and new edits.
  await owner.keyboard.press('Escape')
  await addSticky(owner, 700, 300, 'From the owner')
  await expect.poll(() => shapes(guest)).toHaveLength(2)

  // Even a modified client holding the old link cannot write any more.
  await guest.evaluate(() => {
    const doc = window.editor!.store.doc
    const shape = doc.getMap('shapes').values().next().value as { set(k: string, v: unknown): void }
    doc.transact(() => shape.set('color', 'red'))
  })
  await addSticky(owner, 700, 550, 'Third')
  await expect.poll(() => shapes(guest)).toHaveLength(3)
  const colors = await owner.evaluate(() => window.editor!.store.list().map((s) => s.color))
  expect(colors).not.toContain('red')

  // Opened fresh, the old link is view-only too.
  const late = await openBoard(browser, board.edit)
  await expect(late.getByText('View only')).toBeVisible()

  // The owner hands out the new link, and that one works.
  await owner.getByRole('button', { name: 'Share' }).click()
  await owner.getByRole('button', { name: /Copy edit link/ }).click()
  const newEditUrl = await owner.evaluate(() => navigator.clipboard.readText())
  expect(newEditUrl.endsWith(board.edit.split('#')[1]!)).toBe(false)
  const invited = await openBoard(browser, newEditUrl)
  await expect(invited.getByRole('toolbar', { name: 'Tools' })).toBeVisible()
  await addSticky(invited, 400, 550, 'With the new link')
  await expect.poll(() => shapes(owner)).toHaveLength(4)
})

test('the home page shows your name, ready to keep or change', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/')

  // A name is already filled in on the first visit.
  const name = page.getByRole('textbox', { name: 'Your name' })
  await expect(name).toHaveValue(/^\w+ \w+$/)
  const defaultName = await name.inputValue()

  // Keeping it: the board shows that name.
  await page.getByRole('button', { name: 'New board' }).click()
  await expect(page.getByRole('button', { name: `${defaultName} (you). Rename` })).toBeVisible()

  // Changing it, then pressing Enter, opens a board under the new name.
  await page.getByRole('link', { name: 'All boards' }).click()
  await name.fill('Ada Lovelace')
  await name.press('Enter')
  await expect(page).toHaveURL(/\/b\//)
  await expect(page.getByRole('button', { name: 'Ada Lovelace (you). Rename' })).toBeVisible()

  // Clearing the field does not lose the name.
  await page.getByRole('link', { name: 'All boards' }).click()
  await name.fill('')
  await name.blur()
  await expect(name).toHaveValue('Ada Lovelace')
})

test('a board created from a template starts filled, for everyone', async ({ browser }) => {
  const context = await browser.newContext()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  await page.goto('/')
  await page.getByRole('button', { name: 'New Retrospective board' }).click()

  await expect(page.getByRole('textbox', { name: 'Board title' })).toHaveValue('Retrospective')
  await expect.poll(async () => (await shapes(page)).length).toBeGreaterThan(5)
  const created = await shapes(page)
  expect(created.map((s) => s.text)).toContain('Went well')
  // The template is where the board starts, not something to undo.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()

  // Someone joining sees the same board.
  await page.getByRole('button', { name: 'Share' }).click()
  await page.getByRole('button', { name: /Copy edit link/ }).click()
  const guest = await openBoard(browser, await page.evaluate(() => navigator.clipboard.readText()))
  await expect.poll(async () => (await shapes(guest)).length).toBe(created.length)

  // Reloading does not add it a second time.
  await page.reload()
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible()
  await page.waitForTimeout(500)
  expect(await shapes(page)).toHaveLength(created.length)
})
