import { expect, test, type Page } from '@playwright/test'
import { newBoard, openBoard } from './helpers'

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
  const { edit: url } = await newBoard()
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
  const { edit: url } = await newBoard()
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

test('an arrow follows the shapes it connects when someone else moves them', async ({
  browser,
}) => {
  const { edit: url } = await newBoard()
  const alice = await openBoard(browser, url)
  const bob = await openBoard(browser, url)

  // Alice draws two rectangles and connects them with an arrow.
  for (const x of [250, 650]) {
    await alice.getByRole('button', { name: 'Rectangle' }).click()
    await alice.mouse.click(x, 300)
  }
  await alice.getByRole('button', { name: 'Arrow' }).click()
  await alice.mouse.move(250, 300)
  await alice.mouse.down()
  await alice.mouse.move(650, 300, { steps: 6 })
  await alice.mouse.up()

  const arrow = (page: Page) =>
    page.evaluate(() => {
      const found = window.editor!.store.list().find((s) => s.type === 'arrow')
      return found && { y: found.y, h: found.h, attached: !!(found.startId && found.endId) }
    })
  await expect.poll(() => arrow(bob)).toMatchObject({ attached: true, h: 0 })

  // Bob drags the right-hand rectangle down. He never touches the arrow.
  await bob.mouse.move(650, 300)
  await bob.mouse.down()
  await bob.mouse.move(650, 500, { steps: 6 })
  await bob.mouse.up()

  // For both of them the arrow now slopes down to the moved rectangle.
  for (const page of [alice, bob]) {
    await expect.poll(async () => (await arrow(page))?.h).toBeGreaterThan(100)
    expect(await arrow(page)).toMatchObject({ attached: true })
  }
})

test('a drag sends far fewer messages than mouse moves, and lands in the same place', async ({
  browser,
}) => {
  const { edit: url } = await newBoard()
  // Count board edits (message type 0) that Alice sends. The listener has to
  // be in place before her page opens its connection.
  let sent = 0
  let counting = false
  const alice = await (await browser.newContext()).newPage()
  alice.on('websocket', (ws) =>
    ws.on('framesent', ({ payload }) => {
      if (counting && typeof payload !== 'string' && payload[0] === 0) sent++
    }),
  )
  await alice.goto(url)
  await expect(alice.getByRole('toolbar', { name: 'Tools' })).toBeVisible()
  const bob = await openBoard(browser, url)
  await alice.getByRole('button', { name: 'Rectangle' }).click()
  await alice.mouse.click(300, 300)
  await expect
    .poll(async () => (await bob.evaluate(() => window.editor!.store.list())).length)
    .toBe(1)

  // Playwright's own mouse is slower than a real one, so drive the canvas
  // directly: 120 moves at 60 a second, like a real mouse.
  await alice.waitForTimeout(300)
  counting = true
  await alice.evaluate(async () => {
    const canvas = document.querySelector('canvas')!
    const fire = (type: string, x: number, y: number) =>
      canvas.dispatchEvent(
        // React listens at the root, so the events must bubble.
        new PointerEvent(type, {
          clientX: x,
          clientY: y,
          button: 0,
          buttons: 1,
          pointerId: 1,
          bubbles: true,
        }),
      )
    fire('pointerdown', 300, 300)
    for (let i = 1; i <= 120; i++) {
      await new Promise((resolve) => setTimeout(resolve, 16))
      fire('pointermove', 300 + i * 3, 300 + i)
    }
    fire('pointerup', 660, 420)
  })
  await alice.waitForTimeout(300)
  counting = false

  // About one message per 50 ms instead of one per move.
  expect(sent).toBeGreaterThan(10)
  expect(sent).toBeLessThan(60)
  const position = (page: Page) =>
    page.evaluate(() => {
      const { x, y } = window.editor!.store.list()[0]!
      return { x, y }
    })
  await expect.poll(() => position(bob)).toEqual(await position(alice))
})
