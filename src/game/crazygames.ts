// Thin wrapper around the CrazyGames SDK v3.
// Loaded via <script> in index.html. When the game runs outside an embed
// (local dev, your own domain) window.CrazyGames is undefined and every call
// is a silent no-op — safe to call unconditionally from gameplay code.
//
// Docs: https://docs.crazygames.com/sdk/v3/

// Parameters embedded in a CrazyGames invite link. We use `roomCode` and
// `mode` so a friend who clicks the link lands directly in the right
// Colyseus room. Keys must be short — CG packs them into the URL.
interface InviteParams { roomCode?: string; mode?: string }

interface CrazyGameSettings { muteAudio?: boolean; disableChat?: boolean }
interface CrazyUser { username?: string; profilePictureUrl?: string }

declare global {
  interface Window {
    CrazyGames?: {
      SDK: {
        init: () => Promise<void>
        game: {
          gameplayStart: () => void
          gameplayStop: () => void
          loadingStart: () => void
          loadingStop: () => void
          happytime: () => void
          inviteLink: (params: InviteParams) => string
          getInviteParam: (key: keyof InviteParams) => string | null
          addInviteLinkParamsListener: (cb: (params: InviteParams) => void) => void
          removeInviteLinkParamsListener: (cb: (params: InviteParams) => void) => void
          settings: CrazyGameSettings
          addSettingsChangeListener: (cb: (s: CrazyGameSettings) => void) => void
          removeSettingsChangeListener: (cb: (s: CrazyGameSettings) => void) => void
          updateRoom: (params: { roomId: string; isJoinable?: boolean; inviteParams?: InviteParams }) => void
          leftRoom: () => void
          addJoinRoomListener: (cb: (params: { roomId: string; inviteParams?: InviteParams }) => void) => void
          removeJoinRoomListener: (cb: (params: { roomId: string; inviteParams?: InviteParams }) => void) => void
        }
        user: {
          isUserAccountAvailable: boolean
          getUser: () => Promise<CrazyUser | null>
          getUserToken: () => Promise<string | null>
          showAuthPrompt: () => Promise<CrazyUser | null>
          addAuthListener: (cb: (user: CrazyUser | null) => void) => void
          removeAuthListener: (cb: (user: CrazyUser | null) => void) => void
        }
        ad: {
          requestAd: (
            type: 'midgame' | 'rewarded',
            callbacks: {
              adStarted?: () => void
              adFinished?: () => void
              adError?: (err: unknown) => void
            },
          ) => void
        }
      }
    }
  }
}

const sdk = () => window.CrazyGames?.SDK

let ready = false
let initPromise: Promise<void> | null = null

// Every SDK call must happen AFTER init() resolves and inside a try/catch:
// the SDK throws synchronously on misuse (e.g. sdkNotInitialized), and an
// uncaught throw inside a React effect halts the whole render tree.
function safe(fn: () => void) {
  if (!ready) return
  try { fn() } catch { /* SDK quirks (rate-limits, init order) — non-fatal */ }
}

export function initCrazyGames() {
  if (initPromise) return initPromise
  const s = sdk()
  if (!s) return Promise.resolve()
  initPromise = s.init()
    .then(() => { ready = true; safe(() => s.game.loadingStart()) })
    .catch(() => { /* not embedded / blocked — keep ready=false, calls no-op */ })
  return initPromise
}

export function crazyLoadingDone() {
  safe(() => sdk()!.game.loadingStop())
}

export function crazyGameplayStart() {
  safe(() => sdk()!.game.gameplayStart())
}

export function crazyGameplayStop() {
  safe(() => sdk()!.game.gameplayStop())
}

// Mark a "happy moment" — end of round, level cleared. Signals to CG that
// it's a natural pause where an ad could be slotted (still rate-limited).
export function crazyHappytime() {
  safe(() => sdk()!.game.happytime())
}

// === Multiplayer SDK ===
// CrazyGames generates a short invite URL (https://crazygames.com/game/<slug>?...)
// that other players can open from anywhere. Calling this also tells CG to
// show the in-platform "Invite friends" UI for this room.
export function crazyMakeInviteLink(params: InviteParams, fallback: string): string {
  const s = sdk()
  if (!ready || !s) return fallback
  try { return s.game.inviteLink(params) } catch { return fallback }
}

// On load: if the player arrived via a CG invite link, return the room they
// should auto-join. Returns null otherwise.
export function crazyReadInviteParams(): InviteParams | null {
  const s = sdk()
  if (!ready || !s) return null
  try {
    const roomCode = s.game.getInviteParam('roomCode') || undefined
    const mode = s.game.getInviteParam('mode') || undefined
    return roomCode ? { roomCode, mode } : null
  } catch { return null }
}

// Listen for the player clicking an invite from a friend WHILE the game is
// already open (CG can update params live without a reload). Waits for init
// to resolve before subscribing — the listener API throws otherwise.
// Returns an unsubscribe fn.
export function onCrazyInviteParams(cb: (p: InviteParams) => void): () => void {
  const s = sdk()
  if (!s) return () => {}
  const wrapped = (p: InviteParams) => { try { cb(p) } catch {} }
  let cancelled = false
  let attached = false
  initCrazyGames().then(() => {
    if (cancelled || !ready) return
    try { s.game.addInviteLinkParamsListener(wrapped); attached = true } catch {}
  })
  return () => {
    cancelled = true
    if (attached) { try { s.game.removeInviteLinkParamsListener(wrapped) } catch {} }
  }
}

// === Instant Multiplayer ===
// CG's Multiplayer landing page can launch your game with ?instantJoin=true.
// When that flag is set, the SDK spec says: skip your lobby and put the
// player directly into a joinable room so their friends can hop in.
// We detect it via the URL (same way the SDK itself does internally) — that's
// the most reliable signal and works before init() resolves.
export function isInstantMultiplayer(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.search.includes('instantJoin=true')
}

// === Multiplayer room state (CG-side) ===
// Tells CrazyGames which room the player is in. Required for their friend-
// invite / party flows: their portal needs the room id + invite params to
// pull other players in. Call when joining, again when room state changes
// (e.g. became unjoinable mid-match), and crazyLeaveRoom() when leaving.
export function crazyUpdateRoom(roomId: string, mode?: string, isJoinable = true) {
  safe(() => sdk()!.game.updateRoom({
    roomId,
    isJoinable,
    inviteParams: { roomCode: roomId, mode },
  }))
}

export function crazyLeaveRoom() {
  safe(() => sdk()!.game.leftRoom())
}

// CG portal can ask the game to join a room (e.g. friend joined via the
// CrazyGames party UI while we were idle). Different from the invite-link
// listener: that fires when the URL params change, this fires when CG
// actively pushes us into a room without a navigation.
export function onCrazyJoinRoom(cb: (p: { roomId: string; mode?: string }) => void): () => void {
  const s = sdk()
  if (!s) return () => {}
  const wrapped = (p: { roomId: string; inviteParams?: InviteParams }) => {
    try { cb({ roomId: p.roomId, mode: p.inviteParams?.mode }) } catch {}
  }
  let cancelled = false
  let attached = false
  initCrazyGames().then(() => {
    if (cancelled || !ready) return
    try { s.game.addJoinRoomListener(wrapped); attached = true } catch {}
  })
  return () => {
    cancelled = true
    if (attached) { try { s.game.removeJoinRoomListener(wrapped) } catch {} }
  }
}

// === Audio mute sync ===
// CrazyGames lets users mute games via their site-wide UI. The SDK exposes
// the current value at `settings.muteAudio` and notifies us when it flips.
// Returns an unsubscribe fn. `cb` is called once at init with the initial
// value and again on every change.
export function onCrazyMuteChange(cb: (muted: boolean) => void): () => void {
  const s = sdk()
  if (!s) return () => {}
  const wrapped = (settings: CrazyGameSettings) => { try { cb(!!settings.muteAudio) } catch {} }
  let cancelled = false
  let attached = false
  initCrazyGames().then(() => {
    if (cancelled || !ready) return
    try {
      cb(!!s.game.settings.muteAudio)
      s.game.addSettingsChangeListener(wrapped)
      attached = true
    } catch {}
  })
  return () => {
    cancelled = true
    if (attached) { try { s.game.removeSettingsChangeListener(wrapped) } catch {} }
  }
}

// === User account ===
// If a CrazyGames user is signed in on the portal, return their profile so
// we can pre-fill the display name and skip making players type one.
export async function crazyGetUser(): Promise<CrazyUser | null> {
  const s = sdk()
  if (!s) return null
  await initCrazyGames()
  if (!ready) return null
  try { return await s.user.getUser() } catch { return null }
}

// Subscribe to login/logout events from CG portal so the display name updates
// live if the player signs in mid-session.
export function onCrazyAuthChange(cb: (user: CrazyUser | null) => void): () => void {
  const s = sdk()
  if (!s) return () => {}
  const wrapped = (u: CrazyUser | null) => { try { cb(u) } catch {} }
  let cancelled = false
  let attached = false
  initCrazyGames().then(() => {
    if (cancelled || !ready) return
    try { s.user.addAuthListener(wrapped); attached = true } catch {}
  })
  return () => {
    cancelled = true
    if (attached) { try { s.user.removeAuthListener(wrapped) } catch {} }
  }
}

// Signal a natural break — CrazyGames may insert a midgame ad here, but only
// if their ad cadence allows it (they rate-limit so players aren't spammed).
export function crazyRequestMidgameAd(onDone?: () => void) {
  const s = sdk()
  if (!ready || !s) { onDone?.(); return }
  try {
    s.game.gameplayStop()
    s.ad.requestAd('midgame', {
      adFinished: () => { safe(() => s.game.gameplayStart()); onDone?.() },
      adError:    () => { safe(() => s.game.gameplayStart()); onDone?.() },
    })
  } catch {
    onDone?.()
  }
}

// === Room data update (safe, no-op outside embed) ===
// The CrazyGames SDK exposes platform room metadata APIs in some builds.
// We try a few common method names safely so the call is a no-op outside
// the embed or if the platform method name differs.
export function crazyUpdateRoomData(data: Record<string, any>) {
  const s = sdk()
  if (!ready || !s) return
  try {
    const game: any = s.game
    const tryNames = ['updateRoomData', 'setRoomData', 'setRoomMeta', 'updateRoom']
    for (const n of tryNames) {
      if (typeof game[n] === 'function') {
        try { game[n](data); return } catch {}
      }
    }
    // fallback: some SDKs expose a generic 'room' object
    if (game.room && typeof game.room.update === 'function') {
      try { game.room.update(data); return } catch {}
    }
  } catch {
    // swallow — non-fatal
  }
}
