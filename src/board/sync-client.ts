import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import type * as Y from 'yjs'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

// Message types, shared with the server (worker/board-room.ts).
const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1
const MESSAGE_QUERY_AWARENESS = 3

const PING_INTERVAL_MS = 20_000
/** No message of any kind for this long means the connection is dead. */
const SILENCE_TIMEOUT_MS = 45_000
const MIN_RECONNECT_MS = 250
const MAX_RECONNECT_MS = 8_000

export interface SyncClientOptions {
  /** Injectable for tests. */
  WebSocketImpl?: typeof WebSocket
}

/**
 * Keeps a Yjs document and its presence in sync with the server over one
 * WebSocket, and reconnects by itself.
 *
 * Because the document is a CRDT there is nothing special about being
 * offline: edits keep applying locally, and on reconnect both sides exchange
 * whatever the other is missing (sync step 1 and 2) and converge.
 */
export class SyncClient {
  readonly awareness: Awareness

  private readonly url: string
  private readonly doc: Y.Doc
  private readonly WebSocketImpl: typeof WebSocket

  private ws: WebSocket | null = null
  private status: ConnectionStatus = 'disconnected'
  private shouldConnect = false
  private failedAttempts = 0
  private lastMessageAt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private readonly listeners = new Set<() => void>()
  private synced = false
  private readonly syncedCallbacks: (() => void)[] = []

  constructor(url: string, doc: Y.Doc, options: SyncClientOptions = {}) {
    this.url = url
    this.doc = doc
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket
    this.awareness = new Awareness(doc)

    doc.on('update', this.handleDocUpdate)
    this.awareness.on('update', this.handleAwarenessUpdate)
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
      window.addEventListener('offline', this.handleOffline)
      window.addEventListener('pagehide', this.handlePageHide)
    }
  }

  // ---- Public API ----

  connect(): void {
    this.shouldConnect = true
    if (!this.ws) this.open()
  }

  disconnect(): void {
    this.shouldConnect = false
    this.clearReconnect()
    this.ws?.close()
  }

  destroy(): void {
    this.disconnect()
    this.doc.off('update', this.handleDocUpdate)
    this.awareness.off('update', this.handleAwarenessUpdate)
    this.awareness.destroy()
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('offline', this.handleOffline)
      window.removeEventListener('pagehide', this.handlePageHide)
    }
    this.listeners.clear()
  }

  getStatus = (): ConnectionStatus => this.status

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Run `callback` once the board's content has first arrived from the server. */
  onceSynced(callback: () => void): void {
    if (this.synced) callback()
    else this.syncedCallbacks.push(callback)
  }

  private markSynced(): void {
    if (this.synced) return
    this.synced = true
    for (const callback of this.syncedCallbacks.splice(0)) callback()
  }

  // ---- Connection lifecycle ----

  private open(): void {
    this.clearReconnect()
    const ws = new this.WebSocketImpl(this.url)
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    this.setStatus('connecting')

    ws.onopen = () => {
      this.failedAttempts = 0
      this.lastMessageAt = Date.now()
      this.setStatus('connected')

      // Tell the server what we have; it replies with what we are missing.
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      syncProtocol.writeSyncStep1(encoder, this.doc)
      this.send(encoding.toUint8Array(encoder))
      this.sendOwnAwareness()

      this.pingTimer = setInterval(() => this.checkLiveness(), PING_INTERVAL_MS)
    }

    ws.onmessage = (event: MessageEvent) => {
      this.lastMessageAt = Date.now()
      if (typeof event.data === 'string') return // "pong"
      this.handleMessage(new Uint8Array(event.data as ArrayBuffer))
    }

    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      if (this.pingTimer) clearInterval(this.pingTimer)
      this.pingTimer = null

      // We can no longer see anyone else, so stop showing their cursors.
      const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID)
      removeAwarenessStates(this.awareness, others, this)
      this.setStatus('disconnected')

      if (this.shouldConnect) {
        // Back off exponentially, with jitter so clients don't retry in step.
        const base = Math.min(MAX_RECONNECT_MS, MIN_RECONNECT_MS * 2 ** this.failedAttempts)
        this.failedAttempts++
        this.reconnectTimer = setTimeout(() => this.open(), base * (0.75 + Math.random() * 0.5))
      }
    }
  }

  private checkLiveness(): void {
    if (Date.now() - this.lastMessageAt > SILENCE_TIMEOUT_MS) {
      this.ws?.close()
      return
    }
    // Answered by the server's auto-response without waking the board.
    this.ws?.send('ping')
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return
    this.status = status
    for (const listener of this.listeners) listener()
  }

  private handleOnline = (): void => {
    if (this.shouldConnect && !this.ws) {
      this.failedAttempts = 0
      this.open()
    }
  }

  private handleOffline = (): void => {
    this.ws?.close()
  }

  private handlePageHide = (): void => {
    // Leaving: remove our cursor right away instead of waiting for a timeout.
    this.awareness.setLocalState(null)
  }

  // ---- Messages ----

  private send(message: Uint8Array): void {
    if (this.ws?.readyState === this.WebSocketImpl.OPEN)
      this.ws.send(message as Uint8Array<ArrayBuffer>)
  }

  private handleMessage(data: Uint8Array): void {
    const decoder = decoding.createDecoder(data)
    const type = decoding.readVarUint(decoder)

    if (type === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      // Applies incoming edits (with us as origin) and writes any reply.
      const step = syncProtocol.readSyncMessage(decoder, encoder, this.doc, this)
      // Step 2 is the server's answer to our step 1: we now have the board.
      if (step === syncProtocol.messageYjsSyncStep2) this.markSynced()
      if (encoding.length(encoder) > 1) this.send(encoding.toUint8Array(encoder))
    } else if (type === MESSAGE_AWARENESS) {
      applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this)
    } else if (type === MESSAGE_QUERY_AWARENESS) {
      // Someone joined and needs to know we are here.
      this.sendOwnAwareness()
    }
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this) return // It came from the server; don't send it back.
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    this.send(encoding.toUint8Array(encoder))
  }

  private handleAwarenessUpdate = (_changes: unknown, origin: unknown): void => {
    // Only ever send our own presence; never relay what others told us.
    if (origin !== this) this.sendOwnAwareness()
  }

  private sendOwnAwareness(): void {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(this.awareness, [this.doc.clientID]))
    this.send(encoding.toUint8Array(encoder))
  }
}
