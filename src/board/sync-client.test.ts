import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'
import { SyncClient, UPDATE_INTERVAL_MS } from './sync-client'

/** Stands in for the browser WebSocket and records what the client sends. */
class FakeSocket {
  static readonly OPEN = 1
  static instances: FakeSocket[] = []

  readyState = 0
  binaryType = ''
  sent: (Uint8Array | string)[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: ArrayBuffer | string }) => void) | null = null
  onclose: (() => void) | null = null

  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }

  send(data: Uint8Array | string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = 3
    this.onclose?.()
  }

  // Test helpers.
  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }

  receive(message: Uint8Array) {
    this.onmessage?.({ data: message.slice().buffer })
  }

  /** Message type bytes of everything sent as binary. */
  sentTypes() {
    return this.sent.filter((m) => typeof m !== 'string').map((m) => (m as Uint8Array)[0])
  }
}

const SYNC = 0
const AWARENESS = 1
const QUERY_AWARENESS = 3

function updateMessage(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, SYNC)
  syncProtocol.writeUpdate(encoder, update)
  return encoding.toUint8Array(encoder)
}

function makeClient() {
  const doc = new Y.Doc()
  const client = new SyncClient('ws://test/board', doc, {
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
  })
  client.awareness.setLocalState({ user: 'me' })
  return { doc, client }
}

const lastSocket = () => FakeSocket.instances[FakeSocket.instances.length - 1]!

beforeEach(() => {
  vi.useFakeTimers()
  FakeSocket.instances = []
})
afterEach(() => vi.useRealTimers())

describe('SyncClient', () => {
  it('announces its state and presence when the connection opens', () => {
    const { client } = makeClient()
    client.connect()
    expect(client.getStatus()).toBe('connecting')

    lastSocket().open()
    expect(client.getStatus()).toBe('connected')
    expect(lastSocket().sentTypes()).toEqual([SYNC, AWARENESS])
  })

  it('sends local edits and applies remote ones without echoing them back', () => {
    const { doc, client } = makeClient()
    client.connect()
    const socket = lastSocket()
    socket.open()
    socket.sent = []

    doc.getMap('shapes').set('local', 1)
    expect(socket.sentTypes()).toEqual([SYNC])
    vi.advanceTimersByTime(UPDATE_INTERVAL_MS)

    const remote = new Y.Doc()
    remote.getMap('shapes').set('remote', 2)
    socket.sent = []
    socket.receive(updateMessage(Y.encodeStateAsUpdate(remote)))

    expect(doc.getMap('shapes').get('remote')).toBe(2)
    expect(socket.sent).toEqual([])
  })

  it('sends a burst of edits as one message per interval, without losing any', () => {
    const { doc, client } = makeClient()
    client.connect()
    const socket = lastSocket()
    socket.open()
    socket.sent = []

    // A drag: a hundred position changes within one interval.
    const shapes = doc.getMap('shapes')
    for (let x = 1; x <= 100; x++) shapes.set('x', x)
    // The first goes out at once; the rest wait for the interval.
    expect(socket.sentTypes()).toEqual([SYNC])
    vi.advanceTimersByTime(UPDATE_INTERVAL_MS)
    expect(socket.sentTypes()).toEqual([SYNC, SYNC])
    // Nothing more to send: no further messages.
    vi.advanceTimersByTime(UPDATE_INTERVAL_MS * 5)
    expect(socket.sentTypes()).toEqual([SYNC, SYNC])

    // Applying what was sent gives the receiver the final state.
    const server = new Y.Doc()
    for (const message of socket.sent as Uint8Array[]) {
      const decoder = decoding.createDecoder(message)
      decoding.readVarUint(decoder)
      syncProtocol.readSyncMessage(decoder, encoding.createEncoder(), server, null)
    }
    expect(server.getMap('shapes').get('x')).toBe(100)
  })

  it('sends queued edits straight away when disconnecting', () => {
    const { doc, client } = makeClient()
    client.connect()
    const socket = lastSocket()
    socket.open()
    doc.getMap('shapes').set('a', 1)
    socket.sent = []
    doc.getMap('shapes').set('a', 2)
    expect(socket.sent).toEqual([])
    client.disconnect()
    expect(socket.sentTypes()).toEqual([SYNC])
  })

  it('answers the server asking what it is missing', () => {
    const { doc, client } = makeClient()
    doc.getMap('shapes').set('mine', 1)
    client.connect()
    const socket = lastSocket()
    socket.open()
    socket.sent = []

    // Sync step 1 from a server that has nothing.
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, SYNC)
    syncProtocol.writeSyncStep1(encoder, new Y.Doc())
    socket.receive(encoding.toUint8Array(encoder))

    // The reply is sync step 2 carrying our whole document.
    const reply = socket.sent[0] as Uint8Array
    const decoder = decoding.createDecoder(reply)
    expect(decoding.readVarUint(decoder)).toBe(SYNC)
    const server = new Y.Doc()
    syncProtocol.readSyncMessage(decoder, encoding.createEncoder(), server, null)
    expect(server.getMap('shapes').get('mine')).toBe(1)
  })

  it('reports when the board has first arrived', () => {
    const { client } = makeClient()
    let synced = 0
    client.onceSynced(() => synced++)
    client.connect()
    const socket = lastSocket()
    socket.open()
    expect(synced).toBe(0)

    // The server's reply to our step 1.
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, SYNC)
    syncProtocol.writeSyncStep2(encoder, new Y.Doc())
    socket.receive(encoding.toUint8Array(encoder))
    socket.receive(encoding.toUint8Array(encoder))
    expect(synced).toBe(1)

    // Late subscribers are called straight away.
    client.onceSynced(() => synced++)
    expect(synced).toBe(2)
  })

  it('learns from the server what it may do, and remembers it while offline', () => {
    const { client } = makeClient()
    let changes = 0
    client.subscribe(() => changes++)
    client.connect()
    const socket = lastSocket()
    socket.open()
    expect(client.getAccess()).toBeNull()

    // [access][role: 1 = editor][generation 0][flags 0]
    socket.receive(new Uint8Array([4, 1, 0, 0]))
    expect(client.getAccess()).toEqual({ role: 'editor', generation: 0, full: false })
    const afterFirst = changes
    socket.receive(new Uint8Array([4, 1, 0, 0]))
    expect(changes).toBe(afterFirst)

    socket.close()
    expect(client.getAccess()).toEqual({ role: 'editor', generation: 0, full: false })

    // After a reset the server downgrades this connection.
    vi.advanceTimersByTime(1000)
    lastSocket().open()
    lastSocket().receive(new Uint8Array([4, 0, 1, 0]))
    expect(client.getAccess()).toEqual({ role: 'viewer', generation: 1, full: false })

    // The board fills up: same role, but flagged full.
    lastSocket().receive(new Uint8Array([4, 0, 1, 1]))
    expect(client.getAccess()).toEqual({ role: 'viewer', generation: 1, full: true })
  })

  it('asks the server to reset the edit link', () => {
    const { client } = makeClient()
    client.connect()
    const socket = lastSocket()
    socket.open()
    socket.sent = []

    client.resetEditLink(3, 'abc')
    const message = socket.sent[0] as Uint8Array
    const decoder = decoding.createDecoder(message)
    expect(decoding.readVarUint(decoder)).toBe(5)
    expect(decoding.readVarUint(decoder)).toBe(3)
    expect(decoding.readVarString(decoder)).toBe('abc')
  })

  it('sends only its own presence, also when asked', () => {
    const { client } = makeClient()
    client.connect()
    const socket = lastSocket()
    socket.open()
    socket.sent = []

    client.awareness.setLocalStateField('cursor', { x: 1, y: 2 })
    socket.receive(new Uint8Array([QUERY_AWARENESS]))
    expect(socket.sentTypes()).toEqual([AWARENESS, AWARENESS])
  })

  it('reconnects with backoff and resyncs after the connection drops', () => {
    const { doc, client } = makeClient()
    client.connect()
    lastSocket().open()

    lastSocket().close()
    expect(client.getStatus()).toBe('disconnected')
    expect(FakeSocket.instances).toHaveLength(1)

    // Edits made while offline are simply kept in the document.
    doc.getMap('shapes').set('offline', 1)

    vi.advanceTimersByTime(1000)
    expect(FakeSocket.instances).toHaveLength(2)
    expect(client.getStatus()).toBe('connecting')

    lastSocket().open()
    expect(client.getStatus()).toBe('connected')
    expect(lastSocket().sentTypes()).toEqual([SYNC, AWARENESS])
  })

  it('stays disconnected after disconnect()', () => {
    const { client } = makeClient()
    client.connect()
    lastSocket().open()
    client.disconnect()

    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.instances).toHaveLength(1)
    expect(client.getStatus()).toBe('disconnected')
  })

  it('closes a connection that has gone silent', () => {
    const { client } = makeClient()
    client.connect()
    const socket = lastSocket()
    socket.open()

    vi.advanceTimersByTime(20_000)
    expect(socket.sent).toContain('ping')

    // No pong ever arrives.
    vi.advanceTimersByTime(60_000)
    expect(socket.readyState).toBe(3)
  })
})
