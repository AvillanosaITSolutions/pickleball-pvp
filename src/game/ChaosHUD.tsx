import { useEffect, useRef, useState } from 'react'
import { useGame, comboMultiplier, COMBO_DECAY_MS, rageRank } from './store'

/**
 * Headless ticker — runs at ~30 fps via RAF, drives the session timer
 * + combo decay + rage bleed in the store. We avoid useFrame because it
 * lives inside Canvas; the HUD lives outside.
 */
export function SessionTicker() {
  const tickSession = useGame((s) => s.tickSession)
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = () => {
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      tickSession(dt)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [tickSession])
  return null
}

/** Big top-center combo + multiplier display. Pulses on update. */
export function ChaosHUD() {
  const combo = useGame((s) => s.combo)
  const score = useGame((s) => s.score)
  const ragePct = useGame((s) => s.ragePct)
  const sessionActive = useGame((s) => s.sessionActive)

  // Pulse scale when combo increments
  const lastCombo = useRef(combo)
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    if (combo > lastCombo.current) {
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 180)
      return () => clearTimeout(t)
    }
    lastCombo.current = combo
  }, [combo])

  if (!sessionActive && combo === 0 && score === 0) return null

  const mult = comboMultiplier(combo)
  const chaosLabel = chaosTier(combo)

  return (
    <div className="chaos-hud">
      {combo >= 2 && (
        <div className={'combo' + (pulse ? ' pulse' : '')}>
          <div className="combo-x">×{mult}</div>
          <div className="combo-count">{combo} HITS</div>
          {chaosLabel && <div className="combo-tier">{chaosLabel}</div>}
          <ComboDecayBar />
        </div>
      )}
      {sessionActive && (
        <div className="rage-bar">
          <div className="rage-fill" style={{ width: `${ragePct * 100}%` }} />
          <span className="rage-label">RAGE</span>
        </div>
      )}
      {sessionActive && (
        <div className="score">{score.toLocaleString()}</div>
      )}
    </div>
  )
}

function chaosTier(combo: number): string | null {
  if (combo >= 50) return '🔥 LIMIT BREAK'
  if (combo >= 25) return '⚡ CHAOS'
  if (combo >= 12) return '💥 RAGE'
  if (combo >= 6) return '🔥 ON FIRE'
  if (combo >= 3) return 'HOT'
  return null
}

function ComboDecayBar() {
  const [pct, setPct] = useState(1)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const since = performance.now() - useGame.getState().comboLastHit
      setPct(Math.max(0, 1 - since / COMBO_DECAY_MS))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="combo-decay">
      <div className="combo-decay-fill" style={{ width: `${pct * 100}%` }} />
    </div>
  )
}

/** Top-right session countdown + start button. */
export function SessionTimer() {
  const sessionActive = useGame((s) => s.sessionActive)
  const sessionStart = useGame((s) => s.sessionStart)
  const sessionDuration = useGame((s) => s.sessionDuration)
  const startSession = useGame((s) => s.startSession)
  const endSession = useGame((s) => s.endSession)
  const [remaining, setRemaining] = useState(sessionDuration)

  useEffect(() => {
    if (!sessionActive) return
    let raf = 0
    const loop = () => {
      const elapsed = performance.now() - sessionStart
      setRemaining(Math.max(0, sessionDuration - elapsed))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [sessionActive, sessionStart, sessionDuration])

  return (
    <div className="session-timer" style={{ pointerEvents: 'auto' }}>
      {sessionActive ? (
        <>
          <span className="time">{(remaining / 1000).toFixed(1)}s</span>
          <button className="end" onClick={endSession}>End</button>
        </>
      ) : (
        <button className="start" onClick={startSession}>
          ▶ Start 60s Rage
        </button>
      )}
    </div>
  )
}

/** Post-session summary modal */
export function SummaryScreen() {
  const show = useGame((s) => s.showSummary)
  const close = useGame((s) => s.closeSummary)
  const startSession = useGame((s) => s.startSession)
  const score = useGame((s) => s.score)
  const dmg = useGame((s) => s.dummyDamage)
  const maxCombo = useGame((s) => s.maxCombo)
  const hits = useGame((s) => s.hits)
  const dummyHits = useGame((s) => s.dummyHits)

  if (!show) return null

  const rank = rageRank(score)
  const pesoDmg = (score * 1234).toLocaleString()

  return (
    <div className="overlay">
      <div className="panel summary">
        <h1>🔥 RAGE COMPLETE</h1>
        <p className="rank">Rank: <b>{rank}</b></p>
        <div className="summary-grid">
          <Stat label="Chaos Score" value={score.toLocaleString()} accent="#facc15" />
          <Stat label="Max Combo" value={`×${maxCombo}`} accent="#f97316" />
          <Stat label="Wall Splats" value={hits.toString()} />
          <Stat label="Dummy Hits" value={dummyHits.toString()} />
          <Stat label="Damage" value={dmg.toString()} />
          <Stat label="Throws" value={(hits + dummyHits).toString()} />
        </div>
        <p className="brag">
          You caused <b>₱{pesoDmg}</b> worth of destruction.
        </p>
        <div className="summary-actions">
          <button className="play-again" onClick={() => { close(); startSession() }}>
            ▶ Play Again
          </button>
          <button className="close" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="summary-stat">
      <div className="lbl">{label}</div>
      <div className="val" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  )
}
