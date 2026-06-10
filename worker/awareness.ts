import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'

// Presence ("awareness") updates use the y-protocols wire format:
//   varuint count, then per client: varuint clientId, varuint clock, JSON state
// The server never needs the state itself, so instead of holding a full
// Awareness instance (which would not survive hibernation) it reads just the
// ids and clocks, and can announce that a client has left.

export interface AwarenessEntry {
  clientId: number
  clock: number
  /** True when the update removes the client (state is JSON `null`). */
  removed: boolean
}

export function readAwarenessUpdate(update: Uint8Array): AwarenessEntry[] {
  const decoder = decoding.createDecoder(update)
  const count = decoding.readVarUint(decoder)
  const entries: AwarenessEntry[] = []
  for (let i = 0; i < count; i++) {
    const clientId = decoding.readVarUint(decoder)
    const clock = decoding.readVarUint(decoder)
    const state = decoding.readVarString(decoder)
    entries.push({ clientId, clock, removed: state === 'null' })
  }
  return entries
}

/**
 * Build an update that removes the given clients. Peers only accept an update
 * with a newer clock, so each removal uses the last seen clock plus one.
 */
export function encodeAwarenessRemoval(clocks: Record<string, number>): Uint8Array {
  const ids = Object.keys(clocks)
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, ids.length)
  for (const id of ids) {
    encoding.writeVarUint(encoder, Number(id))
    encoding.writeVarUint(encoder, clocks[id]! + 1)
    encoding.writeVarString(encoder, 'null')
  }
  return encoding.toUint8Array(encoder)
}
