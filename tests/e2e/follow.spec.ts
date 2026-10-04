import { expect, test, type Page } from '@playwright/test'
import { newBoard, openBoard } from './helpers'

const camera = (page: Page) => page.evaluate(() => window.editor!.getState().camera)

/** The second avatar in the list is the other person. */
const otherAvatar = (page: Page) =>
  page.getByRole('list', { name: 'People on this board' }).getByRole('button').nth(1)

test('following someone keeps your view on theirs until you move it yourself', async ({
  browser,
}) => {
  const board = await newBoard()
  const alice = await openBoard(browser, board.edit)
  const bob = await openBoard(browser, board.edit)
  await expect(otherAvatar(bob)).toBeVisible()

  await otherAvatar(bob).click()
  await expect(bob.getByRole('status')).toContainText('Following')
  await expect(alice.getByRole('status')).toContainText('is following you')

  // Alice pans and zooms; Bob's view ends up the same (their windows are the same size).
  await alice.mouse.move(600, 400)
  await alice.mouse.wheel(700, 300)
  await alice.keyboard.down('Control')
  await alice.mouse.wheel(0, -60)
  await alice.keyboard.up('Control')
  const target = await camera(alice)
  expect(target.zoom).toBeGreaterThan(1.5)
  await expect.poll(async () => (await camera(bob)).zoom).toBeCloseTo(target.zoom, 2)
  await expect.poll(async () => (await camera(bob)).x).toBeCloseTo(target.x, 0)
  await expect.poll(async () => (await camera(bob)).y).toBeCloseTo(target.y, 0)

  // Bob scrolls: he is on his own again, and Alice's next move leaves him be.
  await bob.mouse.move(600, 400)
  await bob.mouse.wheel(0, 200)
  await expect(bob.getByRole('status')).toHaveCount(0)
  await expect(alice.getByRole('status')).toHaveCount(0)
  const mine = await camera(bob)
  await alice.mouse.wheel(-900, 0)
  await alice.waitForTimeout(400)
  expect(await camera(bob)).toEqual(mine)
})

test('a view-only visitor can follow a presenter', async ({ browser }) => {
  const board = await newBoard()
  const presenter = await openBoard(browser, board.edit)
  const viewer = await openBoard(browser, board.view)

  await otherAvatar(viewer).click()
  await presenter.mouse.move(600, 400)
  await presenter.mouse.wheel(1200, 800)
  const target = await camera(presenter)
  await expect.poll(async () => (await camera(viewer)).x).toBeCloseTo(target.x, 0)

  await viewer.getByRole('button', { name: 'Stop' }).click()
  await expect(viewer.getByRole('status')).toHaveCount(0)
})
