import { expect, test, type Page } from '@playwright/test'
import { newBoard, openBoard } from './helpers'

const shapes = (page: Page) => page.evaluate(() => window.editor!.store.list())

test('text formatting shows up for everyone', async ({ browser }) => {
  const { edit: url } = await newBoard()
  const alice = await openBoard(browser, url)
  const bob = await openBoard(browser, url)

  // A new sticky opens for typing, with the format panel showing.
  await alice.getByRole('button', { name: 'Sticky note' }).click()
  await alice.mouse.click(400, 300)
  await alice.keyboard.type('Ship it')
  const format = alice.getByRole('toolbar', { name: 'Text format' })
  // A size can be typed, then nudged with the arrow keys. Enter goes back to
  // typing in the note.
  const size = format.getByRole('spinbutton', { name: 'Text size' })
  await size.fill('30')
  await size.press('ArrowUp')
  await expect(size).toHaveValue('31')
  await size.press('Enter')
  await format.getByRole('button', { name: 'Bold' }).click()
  // Shortcuts work while typing, and typing carries on.
  await alice.keyboard.press('ControlOrMeta+i')
  await alice.keyboard.type('!')
  await expect(format.getByRole('button', { name: 'Italic' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await expect
    .poll(async () => (await shapes(bob))[0])
    .toMatchObject({ text: 'Ship it!', fontSize: 31, bold: true, italic: true })

  // Nothing to format: the panel goes away.
  await alice.keyboard.press('Escape')
  await alice.keyboard.press('Escape')
  await expect(format).toBeHidden()
})

test('a new text block can be sized before anything is typed in it', async ({ browser }) => {
  const { edit: url } = await newBoard()
  const page = await openBoard(browser, url)

  await page.getByRole('button', { name: 'Text' }).click()
  await page.mouse.click(400, 300)
  const size = page.getByRole('spinbutton', { name: 'Text size' })
  await size.fill('40')
  await size.press('Enter')
  // Still editing the same, still empty, text block: typing goes into it.
  await page.keyboard.type('Big title')
  await page.keyboard.press('Escape')

  const [text] = await shapes(page)
  expect(text).toMatchObject({ type: 'text', text: 'Big title' })
  // A text block's size is its scale: 40 / 16, so 2.5 lines' height of 21.
  expect(text!.h).toBeCloseTo(21 * 2.5)
})

test('clearing the board removes everything for everyone, and undo brings it back', async ({
  browser,
}) => {
  const { edit: url } = await newBoard()
  const alice = await openBoard(browser, url)
  const bob = await openBoard(browser, url)

  await alice.getByRole('button', { name: 'Rectangle' }).click()
  await alice.mouse.click(300, 300)
  await bob.getByRole('button', { name: 'Ellipse' }).click()
  await bob.mouse.click(700, 300)
  await expect.poll(async () => (await shapes(alice)).length).toBe(2)

  // The first click only asks; the second clears.
  await alice.getByRole('button', { name: 'Clear board' }).click()
  expect(await shapes(bob)).toHaveLength(2)
  await alice.getByRole('button', { name: 'Click again to clear the board' }).click()
  await expect.poll(async () => (await shapes(bob)).length).toBe(0)
  await expect(alice.getByRole('button', { name: 'Clear board' })).toBeDisabled()

  // Undo restores Bob's ellipse as well as Alice's rectangle.
  await alice.getByRole('button', { name: 'Undo' }).click()
  await expect
    .poll(async () => (await shapes(bob)).map((s) => s.type).sort())
    .toEqual(['ellipse', 'rect'])
})

test('a view-only visitor cannot clear the board', async ({ browser }) => {
  const { view } = await newBoard()
  const viewer = await openBoard(browser, view)
  await expect(viewer.getByRole('button', { name: 'Clear board' })).toHaveCount(0)
})
