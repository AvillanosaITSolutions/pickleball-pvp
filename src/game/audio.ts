import { KIND_INFO } from './store'
import type { ProjectileKind } from './store'

// Tiny preloaded Audio pool per kind. Avoid restart latency by keeping a few
// clones; we round-robin so rapid fire / multi-throws don't kill each other.
const POOL_SIZE = 4
const pools = new Map<ProjectileKind, HTMLAudioElement[]>()
const cursors = new Map<ProjectileKind, number>()

function makePool(kind: ProjectileKind) {
  const src = KIND_INFO[kind].audio
  const list: HTMLAudioElement[] = []
  for (let i = 0; i < POOL_SIZE; i++) {
    const a = new Audio(src)
    a.preload = 'auto'
    a.volume = 0.6
    list.push(a)
  }
  pools.set(kind, list)
  cursors.set(kind, 0)
  return list
}

export function preloadAll() {
  ;(Object.keys(KIND_INFO) as ProjectileKind[]).forEach((k) => {
    if (!pools.has(k)) makePool(k)
  })
}

export function playKind(kind: ProjectileKind, volume = 0.6) {
  let pool = pools.get(kind)
  if (!pool) pool = makePool(kind)
  const i = cursors.get(kind) ?? 0
  const audio = pool[i]
  cursors.set(kind, (i + 1) % pool.length)
  audio.currentTime = 0
  audio.volume = volume
  audio.play().catch(() => {
    // Browsers block autoplay until user interacts — silently ignore.
  })
}
