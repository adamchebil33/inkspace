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
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('whiteboard')
  await expect(page.getByRole('heading', { name: 'Your recent boards' })).toHaveCount(0)

  await page.getByRole('button', { name: 'New board' }).click()
  await expect(page).toHaveURL(/\/b\/[\w-]+#[\w-]+$/)
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible()
  const editUrl = page.url()

  await page.getByRole('textbox', { name: 'Board title' }).fill('Sprint planning')
  await expect(page).toHaveTitle('Sprint planning · Inkspace')

  // The share menu hands out both kinds of link.
  await page.getByRole('button', { name: 'Share' }).click()
  await page.getByRole('button', { name: /Copy view-only link/ }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(editUrl.split('#')[0])
  await page.getByRole('button', { name: /Copy edit link/ }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(editUrl)

  // Back on the home page the board is listed, and opens with edit access.
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'All boards' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('link', { name: /Sprint planning/ }).click()
  await expect(page).toHaveURL(editUrl)
  await expect(page.getByRole('textbox', { name: 'Board title' })).toHaveValue('Sprint planning')

  // The creator keeps edit access even through the view-only link.
  await page.goto(editUrl.split('#')[0]!)
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible()
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
