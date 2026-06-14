import { DurableObject } from 'cloudflare:workers'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'
import { encodeAwarenessRemoval, readAwarenessUpdate, type AwarenessEntry } from './awareness'

// Top-level message types, shared with the client (src/board/sync-client.ts).
const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1
const MESSAGE_QUERY_AWARENESS = 3

// Sync sub-message types (y-protocols/sync).
const SYNC_STEP_1 = 0
const SYNC_STEP_2 = 1
const SYNC_UPDATE = 2

const MAX_CONNECTIONS = 40
const MAX_MESSAGE_BYTES = 1024 * 1024
/** Edits are batched for this long, then written as a single row. */
const FLUSH_DELAY_MS = 1000
/** After this many update rows, fold everything into one snapshot. */
const COMPACT_AFTER_ROWS = 50
/** SQLite values are capped at 2 MB, so snapshots are stored in chunks. */
const SNAPSHOT_CHUNK_BYTES = 1024 * 1024

/** Per-socket data. Stored on the socket itself so it survives hibernation. */
interface Attachment {
  canEdit: boolean
  /** Presence client ids announced by this socket, with their latest clock. */
  clocks: Record<string, number>
}

/**
 * One board: the sync server and the storage for a single Yjs document.
 *
 * - Speaks the Yjs sync and awareness protocols (client: src/board/sync-client.ts).
 * - Uses the WebSocket Hibernation API: while nobody is sending anything the
 *   object is evicted from memory and costs nothing, yet sockets stay open.
 *   Anything that must outlive that (the document, per-socket data) is kept
 *   in SQLite or in socket attachments, not in fields.
 * - Persists edits as small batched rows and periodically compacts them.
 */
export class BoardRoom extends DurableObject<Env> {
  private doc: Y.Doc | null = null
  private pending: Uint8Array[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private updateRows = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS snapshot (part INTEGER PRIMARY KEY, data BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB NOT NULL);
    `)
    // Keep-alive pings are answered here without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  // ---- Connections ----

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }
    const peers = this.ctx.getWebSockets()
    if (peers.length >= MAX_CONNECTIONS) {
      return new Response('This board is full', { status: 429 })
    }

    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    this.setAttachment(server, { canEdit: true, clocks: {} })

    // Ask the newcomer what it has that we don't (it asks us the same).
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(encoder, this.getDoc())
    server.send(encoding.toUint8Array(encoder))

    // Ask everyone already here to send their presence, so the newcomer
    // sees them straight away.
    this.send(peers, new Uint8Array([MESSAGE_QUERY_AWARENESS]))

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message === 'string' || message.byteLength > MAX_MESSAGE_BYTES) return
    try {
      const data = new Uint8Array(message)
      const decoder = decoding.createDecoder(data)
      const type = decoding.readVarUint(decoder)
      if (type === MESSAGE_SYNC) this.handleSync(ws, decoder)
      else if (type === MESSAGE_AWARENESS) this.handleAwareness(ws, decoder, data)
    } catch (error) {
      // A malformed message must not take the room down for everyone else.
      console.warn('Dropped a bad message', error)
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.handleDisconnect(ws)
    try {
      // 1005/1006 are reserved and cannot be echoed back.
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason)
    } catch {
      // Already closed.
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.handleDisconnect(ws)
  }

  private handleDisconnect(ws: WebSocket): void {
    const { clocks } = this.getAttachment(ws)
    const others = this.ctx.getWebSockets().filter((peer) => peer !== ws)

    // Tell everyone else this person's cursor is gone.
    if (Object.keys(clocks).length > 0) {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
      encoding.writeVarUint8Array(encoder, encodeAwarenessRemoval(clocks))
      this.send(others, encoding.toUint8Array(encoder))
    }
    this.setAttachment(ws, { canEdit: false, clocks: {} })

    // Last one out: save now rather than waiting for the timer.
    if (others.length === 0) this.flush()
  }

  // ---- Protocol ----

  private handleSync(ws: WebSocket, decoder: decoding.Decoder): void {
    const doc = this.getDoc()
    const step = decoding.readVarUint(decoder)

    if (step === SYNC_STEP_1) {
      // The client sent its state vector; reply with whatever it is missing.
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      syncProtocol.readSyncStep1(decoder, encoder, doc)
      ws.send(encoding.toUint8Array(encoder))
    } else if (step === SYNC_STEP_2 || step === SYNC_UPDATE) {
      // The client sent edits. View-only connections may not write.
      if (!this.getAttachment(ws).canEdit) return
      // Applying fires the doc's update event, which relays and saves it.
      syncProtocol.readSyncStep2(decoder, doc, ws)
    }
  }

  private handleAwareness(ws: WebSocket, decoder: decoding.Decoder, message: Uint8Array): void {
    // Clients only ever send their own presence, so every entry is the sender's.
    const entries = readAwarenessUpdate(decoding.readVarUint8Array(decoder))
    this.trackPresence(ws, entries)
    this.send(
      this.ctx.getWebSockets().filter((peer) => peer !== ws),
      message,
    )
  }

  /** Remember which presence ids a socket owns, so we can remove them on close. */
  private trackPresence(ws: WebSocket, entries: AwarenessEntry[]): void {
    const attachment = this.getAttachment(ws)
    for (const { clientId, clock, removed } of entries) {
      const id = String(clientId)
      if (removed) {
        delete attachment.clocks[id]
        continue
      }
      // First time this socket uses the id: after a reconnect the previous
      // socket may still be around and claim it, so take it over.
      if (!(id in attachment.clocks)) this.releasePresence(id, ws)
      attachment.clocks[id] = clock
    }
    this.setAttachment(ws, attachment)
  }

  private releasePresence(id: string, except: WebSocket): void {
    for (const peer of this.ctx.getWebSockets()) {
      if (peer === except) continue
      const attachment = this.getAttachment(peer)
      if (id in attachment.clocks) {
        delete attachment.clocks[id]
        this.setAttachment(peer, attachment)
      }
    }
  }

  private send(sockets: WebSocket[], message: Uint8Array): void {
    for (const socket of sockets) {
      try {
        socket.send(message)
      } catch {
        // The socket is closing; its close event will clean up.
      }
    }
  }

  private getAttachment(ws: WebSocket): Attachment {
    return (ws.deserializeAttachment() as Attachment | null) ?? { canEdit: false, clocks: {} }
  }

  private setAttachment(ws: WebSocket, attachment: Attachment): void {
    ws.serializeAttachment(attachment)
  }

  // ---- Document and storage ----

  /** The board's document, loaded from SQLite on first use after waking. */
  private getDoc(): Y.Doc {
    if (this.doc) return this.doc
    const doc = new Y.Doc()
    const sql = this.ctx.storage.sql

    const chunks = sql
      .exec<{ data: ArrayBuffer }>('SELECT data FROM snapshot ORDER BY part')
      .toArray()
      .map((row) => new Uint8Array(row.data))
    if (chunks.length > 0) Y.applyUpdate(doc, concat(chunks))

    this.updateRows = 0
    for (const row of sql.exec<{ data: ArrayBuffer }>('SELECT data FROM updates ORDER BY id')) {
      Y.applyUpdate(doc, new Uint8Array(row.data))
      this.updateRows++
    }

    doc.on('update', this.handleDocUpdate)
    this.doc = doc
    return doc
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    // Relay to everyone except the socket the edit came from.
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    this.send(
      this.ctx.getWebSockets().filter((peer) => peer !== origin),
      encoding.toUint8Array(encoder),
    )

    // Save soon. Batching keeps a drag from writing a row per mouse move,
    // which matters for the free plan's daily row-write limit. If the object
    // dies before the flush, clients still hold the edits and resend them
    // when they reconnect.
    this.pending.push(update)
    this.flushTimer ??= setTimeout(() => this.flush(), FLUSH_DELAY_MS)
  }

  private flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    if (this.pending.length === 0) return

    const merged = Y.mergeUpdates(this.pending)
    this.pending = []
    this.ctx.storage.sql.exec('INSERT INTO updates (data) VALUES (?)', toBuffer(merged))
    this.updateRows++

    if (this.updateRows >= COMPACT_AFTER_ROWS) this.compact()
  }

  /** Replace the snapshot and all update rows with one fresh snapshot. */
  private compact(): void {
    const snapshot = Y.encodeStateAsUpdate(this.getDoc())
    const sql = this.ctx.storage.sql
    this.ctx.storage.transactionSync(() => {
      sql.exec('DELETE FROM snapshot')
      for (let part = 0; part * SNAPSHOT_CHUNK_BYTES < snapshot.byteLength; part++) {
        const start = part * SNAPSHOT_CHUNK_BYTES
        const chunk = snapshot.subarray(start, start + SNAPSHOT_CHUNK_BYTES)
        sql.exec('INSERT INTO snapshot (part, data) VALUES (?, ?)', part, toBuffer(chunk))
      }
      sql.exec('DELETE FROM updates')
    })
    this.updateRows = 0
  }
}

/** SQLite stores blobs as ArrayBuffers; copy out exactly this view's bytes. */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}
