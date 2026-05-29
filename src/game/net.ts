import { io, Socket } from 'socket.io-client'
import { useMultiplayer, type RemotePlayer } from './multiplayer'
import { useGame } from './store'
import { useWorldSplats } from './WorldSplats'
import type { ThrowSpec } from './Projectiles'

let socket: Socket | null = null

// Game.tsx registers a callback so incoming projectile throws get pushed into
// the local Projectiles queue with locally-unique ids.
type RemoteThrowHandler = (spec: ThrowSpec) => void
let remoteThrowHandler: RemoteThrowHandler | null = null
export function registerRemoteThrowHandler(h: RemoteThrowHandler | null) {
  remoteThrowHandler = h
}

function apiOrigin(): string {
  const explicit = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined
  if (explicit) return explicit
  // Same origin fallback
  return ''
}

export function getSocket(): Socket {
  if (socket) return socket
  socket = io(apiOrigin(), {
    transports: ['websocket', 'polling'],
    autoConnect: true,
  })

  socket.on('connect', () => {
    if (socket?.id) useMultiplayer.setState({ myId: socket.id })
  })

  socket.on('roster', (payload: { code: string; players: RemotePlayer[]; photoUrl: string | null }) => {
    const me = useMultiplayer.getState().myId
    const others = payload.players.filter((p) => p.id !== me)
    useMultiplayer.setState({
      code: payload.code,
      players: others,
    })
    if (payload.photoUrl && payload.photoUrl !== useGame.getState().dummyPhotoUrl) {
      useMultiplayer.setState({ suppressBroadcast: true })
      useGame.getState().setDummyPhotoUrl(payload.photoUrl)
      useGame.getState().setPhotoUrl(payload.photoUrl)
      useMultiplayer.setState({ suppressBroadcast: false })
    }
  })

  socket.on('pose', (p: { id: string; x: number; y: number; z: number; ry: number; kind?: string }) => {
    useMultiplayer.getState().updatePose(p)
  })

  socket.on('throw', (p: { from: string; spec: ThrowSpec }) => {
    if (p.from === useMultiplayer.getState().myId) return
    if (!remoteThrowHandler) return
    // Reassign id locally so we don't collide with the originator's stream
    remoteThrowHandler({ ...p.spec, id: nextRemoteThrowId-- })
  })

  socket.on('worldSplat', (p: { from: string; splat: any }) => {
    if (p.from === useMultiplayer.getState().myId) return
    suppressNextWorldSplatBroadcast = true
    useWorldSplats.getState().add(p.splat)
    suppressNextWorldSplatBroadcast = false
  })

  socket.on('photo', (p: { url: string | null; from: string }) => {
    if (p.from === useMultiplayer.getState().myId) return
    useMultiplayer.setState({ suppressBroadcast: true })
    useGame.getState().setDummyPhotoUrl(p.url)
    useGame.getState().setPhotoUrl(p.url)
    useMultiplayer.setState({ suppressBroadcast: false })
  })

  return socket
}

export function createRoom(name: string): Promise<{ ok: boolean; code?: string; error?: string }> {
  return new Promise((resolve) => {
    getSocket().emit('createRoom', { name }, (resp: any) => {
      if (resp?.ok) {
        useMultiplayer.setState({ myId: resp.you, code: resp.room.code })
        resolve({ ok: true, code: resp.room.code })
      } else resolve({ ok: false, error: resp?.error ?? 'failed' })
    })
  })
}

export function joinRoom(code: string, name: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    getSocket().emit('joinRoom', { code, name }, (resp: any) => {
      if (resp?.ok) {
        useMultiplayer.setState({ myId: resp.you, code: resp.room.code })
        resolve({ ok: true })
      } else resolve({ ok: false, error: resp?.error ?? 'failed' })
    })
  })
}

export function emitPose(x: number, y: number, z: number, ry: number, kind?: string) {
  if (!socket || !useMultiplayer.getState().code) return
  socket.emit('pose', { x, y, z, ry, kind })
}

export function emitThrow(spec: ThrowSpec) {
  if (!socket || !useMultiplayer.getState().code) return
  socket.emit('throw', spec)
}

let suppressNextWorldSplatBroadcast = false
let nextRemoteThrowId = -1
export function emitWorldSplat(splat: any) {
  if (suppressNextWorldSplatBroadcast) return
  if (!socket || !useMultiplayer.getState().code) return
  socket.emit('worldSplat', splat)
}

export function emitPhoto(url: string | null) {
  if (!socket || !useMultiplayer.getState().code) return
  if (useMultiplayer.getState().suppressBroadcast) return
  socket.emit('photo', { url })
}
