import { Client, Room } from 'colyseus.js'
import { useMultiplayer, type RemotePlayer } from './multiplayer'
import { useGame } from './store'
import { useWorldSplats } from './WorldSplats'
import type { ThrowSpec } from './Projectiles'

// Colyseus replaces the old socket.io transport. The public surface (createRoom,
// joinRoom, emitPose, emitThrow, emitWorldSplat, emitPhoto, registerRemoteThrowHandler)
// is preserved so call sites in Game/Player/MultiplayerHUD don't churn.

// Default mode for legacy code paths; new code passes mode explicitly.
const DEFAULT_MODE = 'rage'

let client: Client | null = null
let room: Room | null = null
let joining: Promise<Room> | null = null

type RemoteThrowHandler = (spec: ThrowSpec) => void
let remoteThrowHandler: RemoteThrowHandler | null = null
export function registerRemoteThrowHandler(h: RemoteThrowHandler | null) {
  remoteThrowHandler = h
}

function endpoint(): string {
  const explicit = (import.meta as any).env?.VITE_COLYSEUS_URL as string | undefined
  if (explicit) return explicit
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.hostname}:2567`
  }
  return 'ws://localhost:2567'
}

function getClient(): Client {
  if (!client) client = new Client(endpoint())
  return client
}

let suppressNextWorldSplatBroadcast = false
let nextRemoteThrowId = -1

function bindRoom(r: Room) {
  room = r
  useMultiplayer.setState({ myId: r.sessionId, code: r.roomId, players: [] })

  // Mirror Colyseus MapSchema -> the existing zustand player list.
  const syncPlayers = () => {
    const me = r.sessionId
    const list: RemotePlayer[] = []
    const map: any = (r.state as any)?.players
    if (map && typeof map.forEach === 'function') {
      map.forEach((p: any, id: string) => {
        if (id === me) return
        list.push({ id, name: p.name, x: p.x, y: p.y, z: p.z, ry: p.ry, kind: p.kind || null })
      })
    }
    useMultiplayer.setState({ players: list })
  }

  r.onStateChange(syncPlayers)

  const playersMap: any = (r.state as any)?.players
  if (playersMap?.onAdd) playersMap.onAdd(syncPlayers)
  if (playersMap?.onRemove) playersMap.onRemove(syncPlayers)
  if (playersMap?.onChange) playersMap.onChange(syncPlayers)

  r.onMessage('throw', (p: { from: string; spec: ThrowSpec }) => {
    if (p.from === r.sessionId) return
    if (!remoteThrowHandler) return
    remoteThrowHandler({ ...p.spec, id: nextRemoteThrowId-- })
  })

  // Photo URL lives in shared state — mirror onto the local game store.
  const splatsArr: any = (r.state as any)?.splats
  if (splatsArr?.onAdd) {
    splatsArr.onAdd((splat: any) => {
      suppressNextWorldSplatBroadcast = true
      useWorldSplats.getState().add({ ...splat })
      suppressNextWorldSplatBroadcast = false
    })
  }

  ;(r.state as any)?.listen?.('photoUrl', (url: string) => {
    const next = url || null
    if (next && next !== useGame.getState().dummyPhotoUrl) {
      useMultiplayer.setState({ suppressBroadcast: true })
      useGame.getState().setDummyPhotoUrl(next)
      useGame.getState().setPhotoUrl(next)
      useMultiplayer.setState({ suppressBroadcast: false })
    }
  })

  r.onLeave(() => {
    if (room === r) {
      room = null
      useMultiplayer.setState({ code: null, players: [], myId: null })
    }
  })
}

export async function createRoom(name: string, mode: string = DEFAULT_MODE): Promise<{ ok: boolean; code?: string; error?: string }> {
  try {
    const r = await getClient().create(mode, { name, mode })
    useMultiplayer.setState({ mode })
    bindRoom(r)
    return { ok: true, code: r.roomId }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'failed' }
  }
}

export async function joinRoom(code: string, name: string, mode: string = DEFAULT_MODE): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await getClient().joinById(code, { name, mode })
    useMultiplayer.setState({ mode })
    bindRoom(r)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'failed' }
  }
}

export async function quickplay(name: string, mode: string = DEFAULT_MODE): Promise<{ ok: boolean; code?: string; error?: string }> {
  if (joining) {
    try { const r = await joining; return { ok: true, code: r.roomId } } catch {}
  }
  try {
    joining = getClient().joinOrCreate(mode, { name, mode })
    const r = await joining
    useMultiplayer.setState({ mode })
    bindRoom(r)
    return { ok: true, code: r.roomId }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'failed' }
  } finally {
    joining = null
  }
}

// Generic helpers for new modes (sabong, etc) — bypasses the rage-specific emit fns.
export function sendRoomMessage(type: string, payload?: any) {
  if (!room) return
  room.send(type, payload)
}
export function getRoom(): Room | null { return room }

export function leaveRoom() {
  room?.leave()
  room = null
  useMultiplayer.setState({ code: null, players: [], myId: null })
}

export function emitPose(x: number, y: number, z: number, ry: number, kind?: string) {
  if (!room) return
  room.send('pose', { x, y, z, ry, kind })
}

export function emitThrow(spec: ThrowSpec) {
  if (!room) return
  room.send('throw', spec)
}

export function emitWorldSplat(splat: any) {
  if (suppressNextWorldSplatBroadcast) return
  if (!room) return
  room.send('worldSplat', splat)
}

export function emitPhoto(url: string | null) {
  if (!room) return
  if (useMultiplayer.getState().suppressBroadcast) return
  room.send('photo', { url })
}
