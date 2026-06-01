// Thin wrapper around the CrazyGames SDK v3.
// Loaded via <script> in index.html. When the game runs outside an embed
// (local dev, your own domain) window.CrazyGames is undefined and every call
// is a silent no-op — safe to call unconditionally from gameplay code.
//
// Docs: https://docs.crazygames.com/sdk/v3/

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
