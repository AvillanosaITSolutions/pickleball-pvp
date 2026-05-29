import { create } from 'zustand'

export interface RemotePlayer {
  id: string
  name: string
  x: number
  y: number
  z: number
  ry: number
  kind?: string | null
}

interface MPState {
  code: string | null
  myId: string | null
  myName: string
  players: RemotePlayer[]
  suppressBroadcast: boolean
  setName: (n: string) => void
  updatePose: (p: { id: string; x: number; y: number; z: number; ry: number; kind?: string }) => void
}

const storedName = (() => {
  try { return localStorage.getItem('mpName') ?? '' } catch { return '' }
})()

export const useMultiplayer = create<MPState>((set) => ({
  code: null,
  myId: null,
  myName: storedName || `Player${Math.floor(Math.random() * 1000)}`,
  players: [],
  suppressBroadcast: false,
  setName: (n) => {
    try { localStorage.setItem('mpName', n) } catch {}
    set({ myName: n })
  },
  updatePose: (p) =>
    set((s) => {
      const i = s.players.findIndex((q) => q.id === p.id)
      if (i < 0) return s
      const next = s.players.slice()
      next[i] = { ...next[i], x: p.x, y: p.y, z: p.z, ry: p.ry, kind: p.kind ?? next[i].kind }
      return { players: next }
    }),
}))
