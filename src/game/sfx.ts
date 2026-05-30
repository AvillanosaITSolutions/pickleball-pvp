// Game-wide sound effect + background music system.
//
// One-shots are pooled (so rapid-fire events don't restart-cancel each other)
// and routed through a single mute flag persisted to localStorage. Missing
// audio files fail silently — we don't ship every clip, the game still works.
//
// Music is a single looping <audio> element; switching tracks crossfades by
// pausing the previous and starting the next. Browsers block autoplay until
// the first user gesture, so callers should invoke playMusic() after a click
// or key press (the lobby/HUD buttons already qualify).

export type SfxKey =
  // Wall of Anger
  | 'whoosh'        // throw release
  | 'hitDummy'      // splat on the dummy body
  | 'comboUp'       // combo milestone (3, 6, 12, …)
  | 'rageMax'       // rage meter filled
  | 'sessionStart'  // session timer begins
  | 'sessionEnd'    // session timer ends
  // Sabong
  | 'peckSwing'     // attack button pressed (melee)
  | 'peckHit'       // melee attack connected
  | 'shoot'         // ranged shot fired
  | 'shotHit'       // ranged shot connected
  | 'jump'          // wing flap / jump
  | 'pickup'        // item picked up
  | 'hurt'          // took damage
  | 'death'         // local bird defeated
  | 'victory'       // local bird won
  | 'itemSpawn'     // item appeared
  // Shared UI
  | 'uiClick'

interface SfxDef { src: string; pool: number; defaultVol: number }

const REGISTRY: Record<SfxKey, SfxDef> = {
  // Reuse existing assets where they fit, so the game has sound the moment a
  // single new file lands rather than going silent until every clip is added.
  whoosh:       { src: '/audio/whoosh.mp3',        pool: 3, defaultVol: 0.4  },
  hitDummy:     { src: '/audio/hit-dummy.mp3',     pool: 3, defaultVol: 0.55 },
  comboUp:      { src: '/audio/combo-up.mp3',      pool: 2, defaultVol: 0.55 },
  rageMax:      { src: '/audio/rage-max.mp3',      pool: 1, defaultVol: 0.6  },
  sessionStart: { src: '/audio/session-start.mp3', pool: 1, defaultVol: 0.6  },
  sessionEnd:   { src: '/audio/session-end.mp3',   pool: 1, defaultVol: 0.6  },

  peckSwing:    { src: '/audio/peck.mp3',          pool: 3, defaultVol: 0.5  },
  peckHit:      { src: '/audio/peck-hit.mp3',      pool: 3, defaultVol: 0.6  },
  shoot:        { src: '/audio/shoot.mp3',         pool: 3, defaultVol: 0.5  },
  shotHit:      { src: '/audio/shot-hit.mp3',      pool: 3, defaultVol: 0.55 },
  jump:         { src: '/audio/jump.mp3',          pool: 3, defaultVol: 0.35 },
  pickup:       { src: '/audio/pickup.mp3',        pool: 2, defaultVol: 0.5  },
  hurt:         { src: '/audio/hurt.mp3',          pool: 3, defaultVol: 0.55 },
  death:        { src: '/audio/death.mp3',         pool: 1, defaultVol: 0.65 },
  victory:      { src: '/audio/victory.mp3',       pool: 1, defaultVol: 0.65 },
  itemSpawn:    { src: '/audio/item-spawn.mp3',    pool: 2, defaultVol: 0.45 },

  uiClick:      { src: '/audio/ui-click.mp3',      pool: 2, defaultVol: 0.4  },
}

export type MusicKey = 'rage' | 'sabong' | 'sabongWaiting' | 'sabongVictory'

const MUSIC_SRC: Record<MusicKey, string> = {
  rage:           '/audio/music-rage.mp3',
  sabong:         '/audio/music-sabong.mp3',
  sabongWaiting:  '/audio/music-sabong-waiting.mp3',
  sabongVictory:  '/audio/music-sabong-victory.mp3',
}

const pools = new Map<SfxKey, HTMLAudioElement[]>()
const cursors = new Map<SfxKey, number>()

function buildPool(key: SfxKey): HTMLAudioElement[] {
  const def = REGISTRY[key]
  const list: HTMLAudioElement[] = []
  for (let i = 0; i < def.pool; i++) {
    const a = new Audio(def.src)
    a.preload = 'auto'
    a.volume = def.defaultVol
    list.push(a)
  }
  pools.set(key, list)
  cursors.set(key, 0)
  return list
}

// --- mute / volume state, persisted across sessions ---
let muted = (() => { try { return localStorage.getItem('audio.muted') === '1' } catch { return false } })()
let sfxVolume = (() => { try { return parseFloat(localStorage.getItem('audio.sfxVol') || '1') || 1 } catch { return 1 } })()
let musicVolume = (() => { try { return parseFloat(localStorage.getItem('audio.musicVol') || '0.4') || 0.4 } catch { return 0.4 } })()

const listeners = new Set<() => void>()
function notify() { listeners.forEach((fn) => fn()) }
export function subscribeAudio(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn) }

export function isMuted() { return muted }
export function setMuted(m: boolean) {
  muted = m
  try { localStorage.setItem('audio.muted', m ? '1' : '0') } catch {}
  if (musicEl) musicEl.muted = m
  notify()
}
export function toggleMuted() { setMuted(!muted) }
export function setSfxVolume(v: number) { sfxVolume = Math.max(0, Math.min(1, v)); try { localStorage.setItem('audio.sfxVol', String(sfxVolume)) } catch {}; notify() }
export function setMusicVolume(v: number) {
  musicVolume = Math.max(0, Math.min(1, v))
  try { localStorage.setItem('audio.musicVol', String(musicVolume)) } catch {}
  if (musicEl) musicEl.volume = musicVolume
  notify()
}
export function getSfxVolume() { return sfxVolume }
export function getMusicVolume() { return musicVolume }

export function playSfx(key: SfxKey, opts: { volume?: number } = {}) {
  if (muted) return
  let pool = pools.get(key)
  if (!pool) pool = buildPool(key)
  const i = cursors.get(key) ?? 0
  const audio = pool[i]
  cursors.set(key, (i + 1) % pool.length)
  try {
    audio.currentTime = 0
    audio.volume = Math.max(0, Math.min(1, (opts.volume ?? REGISTRY[key].defaultVol) * sfxVolume))
    audio.play().catch(() => { /* missing file or autoplay block — silent */ })
  } catch { /* swallow */ }
}

// --- background music ---
let musicEl: HTMLAudioElement | null = null
let musicKey: MusicKey | null = null

export function playMusic(key: MusicKey) {
  if (musicKey === key && musicEl && !musicEl.paused) return
  stopMusic()
  const a = new Audio(MUSIC_SRC[key])
  a.loop = true
  a.preload = 'auto'
  a.volume = musicVolume
  a.muted = muted
  musicEl = a
  musicKey = key
  a.play().catch(() => { /* autoplay blocked — user gesture pending */ })
}

export function stopMusic() {
  if (!musicEl) return
  try { musicEl.pause() } catch {}
  musicEl = null
  musicKey = null
}

export function currentMusic(): MusicKey | null { return musicKey }
