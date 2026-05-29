import { io, Socket } from 'socket.io-client'
import { useMultiplayer, type RemotePlayer } from './multiplayer'
import { useGame } from './store'

let socket: Socket | null = null

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

  socket.on('pose', (p: { id: string; x: number; y: number; z: number; ry: number }) => {
    useMultiplayer.getState().updatePose(p)
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

export function emitPose(x: number, y: number, z: number, ry: number) {
  if (!socket || !useMultiplayer.getState().code) return
  socket.emit('pose', { x, y, z, ry })
}

export function emitPhoto(url: string | null) {
  if (!socket || !useMultiplayer.getState().code) return
  if (useMultiplayer.getState().suppressBroadcast) return
  socket.emit('photo', { url })
}
