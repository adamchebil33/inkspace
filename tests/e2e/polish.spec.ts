import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { addSticky, newBoard, openBoard, shapes } from './helpers'

test('the theme toggle switches the whole app and is remembered', async ({ browser }) => {
  const page = await openBoard(browser, (await newBoard()).edit)
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'light')

  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(22, 22, 24)')

  // The canvas repaints too: its top-left pixel is now the dark background.
  const pixel = () =>
    page.evaluate(() => {
      const canvas = document.querySelector('canvas')!
      return [...canvas.getContext('2d')!.getImageData(4, 4, 1, 1).data.slice(0, 3)]
    })
  await expect.poll(pixel).toEqual([22, 22, 24])

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
})

test('follows the system theme until a choice is made', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('downloads the board as a PNG', async ({ browser }) => {
  const page = await openBoard(browser, (await newBoard()).edit)
  await page.getByRole('textbox', { name: 'Board title' }).fill('Launch plan')

  // Nothing to export yet.
  await page.getByRole('button', { name: 'Share' }).click()
  await page.getByRole('button', { name: /Download as PNG/ }).click()
  await expect(page.getByText('The board is empty')).toBeVisible()
  await page.keyboard.press('Escape')

  await addSticky(page, 400, 300, 'Ship it')
  await page.getByRole('button', { name: 'Share' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download as PNG/ }).click(),
  ])
  expect(download.suggestedFilename()).toBe('launch-plan.png')

  const file = await readFile(await download.path())
  // PNG signature, then the IHDR chunk with the image size: one 200x200
  // sticky plus 48px of padding on each side, at 2x.
  expect(file.subarray(1, 4).toString()).toBe('PNG')
  expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([592, 592])
})

test('a board with content opens framed around it', async ({ browser }) => {
  const board = await newBoard()
  const alice = await openBoard(browser, board.edit)
  await addSticky(alice, 300, 300, 'Near')
  // Put a second note far outside the default view.
  await alice.evaluate(() => {
    const editor = window.editor!
    editor.store.add({ ...editor.store.list()[0]!, id: 'far-away', x: 4000, y: 2500, text: 'Far' })
  })
  await expect.poll(() => shapes(alice)).toHaveLength(2)

  const bob = await openBoard(browser, board.edit)
  await expect.poll(() => shapes(bob)).toHaveLength(2)
  const zoom = () => bob.evaluate(() => window.editor!.getState().camera.zoom)
  await expect.poll(zoom).toBeLessThan(0.5)
  await expect(bob.getByTitle('Reset zoom to 100%')).not.toHaveText('100%')

  // "Zoom to fit" does the same on demand.
  await bob.getByTitle('Reset zoom to 100%').click()
  await bob.getByRole('button', { name: 'Zoom to fit' }).click()
  await expect.poll(zoom).toBeLessThan(0.5)
})

test('lists keyboard shortcuts and hints at how to start', async ({ browser }) => {
  const page = await openBoard(browser, (await newBoard()).edit)
  await expect(page.getByText('Double-click anywhere to add a sticky note')).toBeVisible()

  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog.getByText('Zoom to fit')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await page.mouse.dblclick(500, 400)
  await page.keyboard.type('Started')
  await page.keyboard.press('Escape')
  await expect(page.getByText('Double-click anywhere to add a sticky note')).toHaveCount(0)
})
