import { expect, type Browser, type Page } from '@playwright/test'
import { boardIdForKey, newEditKey } from '../../shared/boardKey'

export interface BoardLinks {
  /** Link that allows editing (carries the key in its fragment). */
  edit: string
  /** Link to the same board without the key. */
  view: string
}

/** A fresh board per test, so tests never see each other's shapes. */
export async function newBoard(): Promise<BoardLinks> {
  const key = newEditKey()
  const id = await boardIdForKey(key)
  return { edit: `/b/${id}#${key}`, view: `/b/${id}` }
}

const randomAddress = () =>
  Array.from({ length: 4 }, () => Math.floor(Math.random() * 254) + 1).join('.')

/** Each person gets their own browser context: separate storage, separate socket. */
export async function openBoard(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext({
    // The AI endpoint is rate limited per visitor address. Every test visitor
    // would otherwise share one address and trip each other's limit. (In
    // production Cloudflare sets this header itself, so it cannot be spoofed.)
    extraHTTPHeaders: { 'CF-Connecting-IP': randomAddress() },
  })
  const page = await context.newPage()
  await page.goto(url)
  await expect(page.getByRole('textbox', { name: 'Board title' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)
  return page
}

/** The board is a canvas, so read shapes from the editor instead of the DOM. */
export const shapes = (page: Page) =>
  page.evaluate(() =>
    window.editor!.store.list().map(({ type, text, x, y }) => ({ type, text, x, y })),
  )

export const shapeTypes = async (page: Page) => (await shapes(page)).map((s) => s.type).sort()

export async function addSticky(page: Page, x: number, y: number, text: string) {
  await page.getByRole('button', { name: 'Sticky note' }).click()
  await page.mouse.click(x, y)
  await page.keyboard.type(text)
  await page.keyboard.press('Escape')
}

export async function dragMouse(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from)
  await page.mouse.down()
  await page.mouse.move(...to, { steps: 5 })
  await page.mouse.up()
}
