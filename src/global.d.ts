import type { Editor } from './board/editor'

declare global {
  interface Window {
    /** Development only: the current board's editor. */
    editor?: Editor
  }
}
