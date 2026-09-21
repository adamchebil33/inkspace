import { expect, test } from '@playwright/test'
import { addSticky, dragMouse, newBoard, openBoard, shapes } from './helpers'

test('a change in one window shows up in the other', async ({ browser }) => {
  const board = await newBoard()
  const alice = await openBoard(browser, board.edit)
  const bob = await openBoard(browser, board.edit)

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
  const board = await newBoard()
  const alice = await openBoard(browser, board.edit)
  await addSticky(alice, 300, 300, 'First')
  await addSticky(alice, 600, 300, 'Second')

  // Wait until the server has it, then have everyone leave.
  const probe = await openBoard(browser, board.edit)
  await expect.poll(() => shapes(probe)).toHaveLength(2)
  await alice.context().close()
  await probe.context().close()

  const bob = await openBoard(browser, board.edit)
  await expect
    .poll(async () => (await shapes(bob)).map((s) => s.text).sort())
    .toEqual(['First', 'Second'])
})

test('edits made offline are merged after reconnecting', async ({ browser }) => {
  const board = await newBoard()
  const alice = await openBoard(browser, board.edit)
  const bob = await openBoard(browser, board.edit)
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

test('two people typing in the same note keep both their words', async ({ browser }) => {
  const board = await newBoard()
  const alice = await openBoard(browser, board.edit)
  const bob = await openBoard(browser, board.edit)
  await addSticky(alice, 400, 300, 'middle')
  await expect.poll(() => shapes(bob)).toMatchObject([{ text: 'middle' }])

  // Both open the note for editing. Alice's caret is at the end.
  await alice.mouse.dblclick(400, 300)
  await bob.mouse.dblclick(400, 300)
  const aliceField = alice.getByRole('textbox', { name: 'Shape text' })
  const bobField = bob.getByRole('textbox', { name: 'Shape text' })
  await expect(aliceField).toBeFocused()
  await expect(bobField).toBeFocused()

  // Bob types at the start while Alice types at the end, interleaved.
  await bob.keyboard.press('Control+Home')
  for (const [a, b] of [
    [' e', 's'],
    ['n', 't'],
    ['d', 'art '],
  ]) {
    await alice.keyboard.type(a!)
    await bob.keyboard.type(b!)
  }

  for (const page of [alice, bob]) {
    await expect.poll(() => shapes(page)).toMatchObject([{ text: 'start middle end' }])
  }
  // Each person's caret stayed with their own words, so what they see in the
  // field is the merged text too.
  await expect(aliceField).toHaveValue('start middle end')
  await expect(bobField).toHaveValue('start middle end')
})
