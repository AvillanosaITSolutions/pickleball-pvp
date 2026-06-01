import { create } from 'zustand'
import { FREE_TRIAL_MS, PAYWALL_ENABLED } from './pricing'

// Lazy import to avoid loading socket.io-client until multiplayer is engaged.
function emitPhotoSafe(url: string | null) {
  import('./net').then((m) => m.emitPhoto(url)).catch(() => {})
}

export type ProjectileKind =
  | 'tomato'
  | 'egg'
  | 'banana'
  | 'cake'
  | 'shit'
  | 'paint'
  | 'water'
  | 'rock'
  | 'brick'
  | 'bowlingBall'
  | 'chair'
  | 'tv'
  | 'gun'

export const KIND_ORDER: ProjectileKind[] = [
  'tomato',
  'egg',
  'banana',
  'cake',
  'shit',
  'paint',
  'water',
  'rock',
  'brick',
  'bowlingBall',
  'chair',
  'tv',
  'gun',
]

export interface Splat {
  id: number
  x: number
  y: number
  radius: number
  color: string
  kind: ProjectileKind
  rotation: number
}

export interface DummySplat {
  id: number
  // Local position relative to dummy body origin
  lx: number
  ly: number
  lz: number
  // Outward normal (radial from body center)
  nx: number
  ny: number
  nz: number
  radius: number
  color: string
  kind: ProjectileKind
  rotation: number
  onHead: boolean
}

export type RageRank = 'Calm' | 'Irritated' | 'Angry' | 'Unstable' | 'Chaos Entity'

interface State {
  photoUrl: string | null
  dummyPhotoUrl: string | null
  timeRemainingMs: number  // total purchased + free-trial time left
  charge: number
  throws: number
  hits: number
  dummyHits: number
  dummyDamage: number
  splats: Splat[]
  dummySplats: DummySplat[]
  selectedKind: ProjectileKind

  // Session / combo / score
  sessionActive: boolean
  sessionStart: number   // performance.now() when started
  sessionDuration: number // ms — default 60_000
  combo: number          // current consecutive hit count
  comboLastHit: number   // performance.now() of last hit, for decay
  maxCombo: number
  score: number          // damage * multiplier accumulated
  ragePct: number        // 0..1 rage meter (decays slowly)
  showSummary: boolean

  setPhotoUrl: (url: string | null) => void
  setDummyPhotoUrl: (url: string | null) => void
  addTime: (ms: number) => void
  spendTime: (ms: number) => void
  hasTime: () => boolean
  setCharge: (c: number) => void
  setSelectedKind: (k: ProjectileKind) => void
  registerThrow: () => void
  registerHit: (s: Omit<Splat, 'id'>) => void
  registerDummyHit: (damage: number, splat: Omit<DummySplat, 'id'>) => void
  cycleKind: (dir: number) => void
  clearDummySplats: () => void
  clearSplats: () => void

  // Session controls
  startSession: () => void
  endSession: () => void
  closeSummary: () => void
  tickSession: (dt: number) => void
}

let nextId = 1

export const useGame = create<State>((set, get) => ({
  photoUrl: (() => {
    try {
      const v = localStorage.getItem('photoUrl')
      return v ?? null
    } catch {
      return null
    }
  })(),
  dummyPhotoUrl: (() => {
    try {
      const v = localStorage.getItem('dummyPhotoUrl')
      return v ?? null
    } catch {
      return null
    }
  })(),
  timeRemainingMs: (() => {
    try {
      const stored = localStorage.getItem('timeRemainingMs')
      if (stored !== null) return parseInt(stored, 10) || 0
    } catch {}
    // First visit: grant free trial defined in pricing.ts
    return FREE_TRIAL_MS
  })(),
  charge: 0,
  throws: 0,
  hits: 0,
  dummyHits: 0,
  dummyDamage: 0,
  splats: [],
  dummySplats: [],
  selectedKind: 'tomato',

  sessionActive: false,
  sessionStart: 0,
  sessionDuration: 60_000,
  combo: 0,
  comboLastHit: 0,
  maxCombo: 0,
  score: 0,
  ragePct: 0,
  showSummary: false,
  setPhotoUrl: (url) => {
    try {
      if (url === null) localStorage.removeItem('photoUrl')
      else localStorage.setItem('photoUrl', url)
    } catch {}
    set({ photoUrl: url })
    emitPhotoSafe(url)
  },
  setDummyPhotoUrl: (url) => {
    try {
      if (url === null) localStorage.removeItem('dummyPhotoUrl')
      else localStorage.setItem('dummyPhotoUrl', url)
    } catch {}
    set({ dummyPhotoUrl: url })
    emitPhotoSafe(url)
  },
  addTime: (ms) => {
    const next = get().timeRemainingMs + ms
    try { localStorage.setItem('timeRemainingMs', String(next)) } catch {}
    set({ timeRemainingMs: next })
  },
  spendTime: (ms) => {
    // Paywall disabled → never drain the pool. Keeps the timer visually
    // stable and prevents the "out of time" overlay from ever firing.
    if (!PAYWALL_ENABLED) return
    const next = Math.max(0, get().timeRemainingMs - ms)
    try { localStorage.setItem('timeRemainingMs', String(next)) } catch {}
    set({ timeRemainingMs: next })
  },
  hasTime: () => !PAYWALL_ENABLED || get().timeRemainingMs > 0,
  setCharge: (c) => set({ charge: c }),
  setSelectedKind: (k) => set({ selectedKind: k }),
  registerThrow: () => set((s) => ({ throws: s.throws + 1 })),
  registerHit: (splat) =>
    set((s) => {
      const now = performance.now()
      const stillCombo = now - s.comboLastHit < COMBO_DECAY_MS
      const combo = stillCombo ? s.combo + 1 : 1
      const mult = comboMultiplier(combo)
      return {
        hits: s.hits + 1,
        splats: [...s.splats, { id: nextId++, ...splat }].slice(-200),
        combo,
        comboLastHit: now,
        maxCombo: Math.max(s.maxCombo, combo),
        // Wall hits worth a small base, multiplied by combo
        score: s.score + Math.round(5 * mult),
        ragePct: Math.min(1, s.ragePct + 0.02 * mult),
      }
    }),
  registerDummyHit: (damage, splat) =>
    set((s) => {
      const now = performance.now()
      const stillCombo = now - s.comboLastHit < COMBO_DECAY_MS
      const combo = stillCombo ? s.combo + 1 : 1
      const mult = comboMultiplier(combo)
      return {
        dummyHits: s.dummyHits + 1,
        dummyDamage: s.dummyDamage + damage,
        dummySplats: [...s.dummySplats, { id: nextId++, ...splat }].slice(-80),
        combo,
        comboLastHit: now,
        maxCombo: Math.max(s.maxCombo, combo),
        score: s.score + Math.round(damage * 25 * mult),
        ragePct: Math.min(1, s.ragePct + 0.05 * mult),
      }
    }),
  cycleKind: (dir) =>
    set((s) => {
      const i = KIND_ORDER.indexOf(s.selectedKind)
      const next = (i + dir + KIND_ORDER.length) % KIND_ORDER.length
      return { selectedKind: KIND_ORDER[next] }
    }),
  clearDummySplats: () => set({ dummySplats: [] }),
  clearSplats: () =>
    set({
      splats: [],
      dummySplats: [],
      hits: 0,
      throws: 0,
      dummyHits: 0,
      dummyDamage: 0,
    }),

  startSession: () =>
    set({
      sessionActive: true,
      sessionStart: performance.now(),
      combo: 0,
      maxCombo: 0,
      comboLastHit: 0,
      score: 0,
      ragePct: 0,
      hits: 0,
      dummyHits: 0,
      dummyDamage: 0,
      throws: 0,
      splats: [],
      dummySplats: [],
      showSummary: false,
    }),

  endSession: () =>
    set({
      sessionActive: false,
      showSummary: true,
    }),

  closeSummary: () => set({ showSummary: false }),

  tickSession: (dt) =>
    set((s) => {
      const out: Partial<State> = {}
      // Combo decay
      if (s.combo > 0 && performance.now() - s.comboLastHit > COMBO_DECAY_MS) {
        out.combo = 0
      }
      // Rage meter slow bleed
      if (s.ragePct > 0) out.ragePct = Math.max(0, s.ragePct - dt * 0.04)
      // Auto-end session at duration
      if (
        s.sessionActive &&
        performance.now() - s.sessionStart >= s.sessionDuration
      ) {
        out.sessionActive = false
        out.showSummary = true
      }
      return out
    }),
}))

// --- Combo helpers ---
export const COMBO_DECAY_MS = 2000
export function comboMultiplier(combo: number): number {
  if (combo < 3) return 1
  if (combo < 6) return 2
  if (combo < 12) return 3
  if (combo < 20) return 5
  if (combo < 35) return 10
  return 25
}
export function rageRank(score: number): RageRank {
  if (score < 500) return 'Calm'
  if (score < 2000) return 'Irritated'
  if (score < 6000) return 'Angry'
  if (score < 15000) return 'Unstable'
  return 'Chaos Entity'
}

export interface KindInfo {
  color: string
  splatColor: string
  label: string
  mass: number
  splatScale: number
  damage: number
  emoji: string  // thumbnail
  audio: string  // path under /public, e.g. /audio/tomato.mp3
}

export const KIND_INFO: Record<ProjectileKind, KindInfo> = {
  // FREE objects — instant fun, no credits required (spec §4.1)
  tomato:      { color: '#dc2626', splatColor: '#b91c1c', label: 'Tomato',         mass: 0.3,  splatScale: 1.0, damage: 1,  emoji: '🍅', audio: '/audio/thud.mp3' },
  egg:         { color: '#fef3c7', splatColor: '#fde68a', label: 'Egg',            mass: 0.15, splatScale: 0.9, damage: 1,  emoji: '🥚', audio: '/audio/thud.mp3' },
  banana:      { color: '#facc15', splatColor: '#a16207', label: 'Banana',         mass: 0.15, splatScale: 0.6, damage: 1,  emoji: '🍌', audio: '/audio/thud.mp3' },
  cake:        { color: '#fce7f3', splatColor: '#fbcfe8', label: 'Birthday Cake',  mass: 0.6,  splatScale: 1.9, damage: 2,  emoji: '🎂', audio: '/audio/thud.mp3' },
  shit:        { color: '#3f2812', splatColor: '#3f2812', label: 'Pile of Shit',   mass: 0.4,  splatScale: 1.5, damage: 2,  emoji: '💩', audio: '/audio/thud.mp3' },
  paint:       { color: '#7c3aed', splatColor: '#6d28d9', label: 'Paint',          mass: 0.4,  splatScale: 1.4, damage: 1,  emoji: '🎨', audio: '/audio/thud.mp3' },
  water:       { color: '#60a5fa', splatColor: '#3b82f6', label: 'Glass of Water', mass: 0.5,  splatScale: 1.3, damage: 1,  emoji: '💧', audio: '/audio/thud.mp3' },
  // CREDIT objects — chaos amplifiers
  rock:        { color: '#525252', splatColor: '#374151', label: 'Rock',           mass: 1.0,  splatScale: 0.7, damage: 3,  emoji: '🪨', audio: '/audio/thud.mp3' },
  brick:       { color: '#9a3412', splatColor: '#7c2d12', label: 'Brick',          mass: 2.5,  splatScale: 0.9, damage: 7,  emoji: '🧱', audio: '/audio/thud.mp3' },
  chair:       { color: '#92400e', splatColor: '#7c2d12', label: 'Chair',          mass: 4.0,  splatScale: 1.8, damage: 8,  emoji: '🪑', audio: '/audio/thud.mp3' },
  // PREMIUM CHAOS — spectacle items
  bowlingBall: { color: '#171717', splatColor: '#0a0a0a', label: 'Bowling Ball',   mass: 5.5,  splatScale: 1.1, damage: 10, emoji: '🎳', audio: '/audio/thud.mp3' },
  tv:          { color: '#1c1917', splatColor: '#e5e7eb', label: 'Television',     mass: 6.0,  splatScale: 2.0, damage: 12, emoji: '📺', audio: '/audio/thud.mp3' },
  gun:         { color: '#27272a', splatColor: '#0a0a0a', label: 'Pistol',         mass: 0,    splatScale: 1.0, damage: 4,  emoji: '🔫', audio: '/audio/gunshot.mp3' },
}
