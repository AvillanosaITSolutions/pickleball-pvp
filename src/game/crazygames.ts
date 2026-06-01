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

let initPromise: Promise<void> | null = null

export function initCrazyGames() {
  if (initPromise) return initPromise
  const s = sdk()
  if (!s) return Promise.resolve()
  initPromise = s.init().catch(() => {})
  s.game.loadingStart()
  return initPromise
}

export function crazyLoadingDone() {
  sdk()?.game.loadingStop()
}

export function crazyGameplayStart() {
  sdk()?.game.gameplayStart()
}

export function crazyGameplayStop() {
  sdk()?.game.gameplayStop()
}

// Signal a natural break — CrazyGames may insert a midgame ad here, but only
// if their ad cadence allows it (they rate-limit so players aren't spammed).
export function crazyRequestMidgameAd(onDone?: () => void) {
  const s = sdk()
  if (!s) { onDone?.(); return }
  s.game.gameplayStop()
  s.ad.requestAd('midgame', {
    adFinished: () => { s.game.gameplayStart(); onDone?.() },
    adError: () => { s.game.gameplayStart(); onDone?.() },
  })
}
