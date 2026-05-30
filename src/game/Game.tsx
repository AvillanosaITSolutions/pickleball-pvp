import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { useEffect, useState } from 'react'
import { Room } from './Room'
import { Wall } from './Wall'
import { Props } from './Props'
import { HateWalls } from './HateWalls'
import { Dummy } from './Dummy'
import { Player } from './Player'
import { Projectiles } from './Projectiles'
import { RemotePlayers } from './RemotePlayer'
import { MultiplayerHUD } from './MultiplayerHUD'
import { MuteChip } from './SabongGame'
import { registerRemoteThrowHandler } from './net'
import type { ThrowSpec } from './Projectiles'
import { useGame, KIND_INFO, KIND_ORDER } from './store'
import type { ProjectileKind } from './store'
import { TIME_PACKS, formatTime } from './pricing'
import { preloadAll } from './audio'
import { playMusic, stopMusic, playSfx } from './sfx'
import { CameraEffects } from './CameraEffects'
import { Trajectory } from './Trajectory'
import { WorldSplats, useWorldSplats } from './WorldSplats'
import { ChaosHUD, SessionTimer, SummaryScreen, SessionTicker } from './ChaosHUD'
import { ErrorBoundary, installGlobalErrorSuppressor } from './ErrorBoundary'

/**
 * Read a File, decode it as an image, resize so the longest side ≤ maxDim,
 * and return a JPEG data URL. Used to keep persisted photos under
 * localStorage's ~5MB ceiling.
 */
function fileToCompressedDataUrl(file: File, maxDim = 1024, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let w = img.width
        let h = img.height
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round(h * (maxDim / w))
            w = maxDim
          } else {
            w = Math.round(w * (maxDim / h))
            h = maxDim
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas 2d ctx failed'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => reject(new Error('image decode failed'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('file read failed'))
    reader.readAsDataURL(file)
  })
}

const KEY_LABEL: Partial<Record<ProjectileKind, string>> = {
  tomato: '1',
  egg: '2',
  banana: '3',
  cake: '4',
  shit: '5',
  paint: '6',
  water: '7',
  rock: '8',
  brick: '9',
  bowlingBall: '0',
  chair: 'C',
  tv: 'T',
  gun: 'G',
}

export function Game() {
  const [throws, setThrows] = useState<ThrowSpec[]>([])
  const [locked, setLocked] = useState(false)
  const setPhotoUrl = useGame((s) => s.setPhotoUrl)
  const setDummyPhotoUrl = useGame((s) => s.setDummyPhotoUrl)
  // Hydrate from localStorage so uploaded photos persist across reloads.
  // Note: blob: URLs don't survive reload, only data: URLs do — so handleFile
  // below uses FileReader.readAsDataURL which produces data URLs.
  const [photoUrlState, setPhotoUrlState] = useState<string | null>(() => {
    try {
      const v = localStorage.getItem('photoUrl')
      return v && v.startsWith('data:') ? v : null
    } catch {
      return null
    }
  })
  const [dummyPhotoUrlState, setDummyPhotoUrlState] = useState<string | null>(() => {
    try {
      const v = localStorage.getItem('dummyPhotoUrl')
      return v && v.startsWith('data:') ? v : null
    } catch {
      return null
    }
  })
  const timeRemainingMs = useGame((s) => s.timeRemainingMs)
  const spendTime = useGame((s) => s.spendTime)
  const [showStore, setShowStore] = useState(false)
  const [showWallDialog, setShowWallDialog] = useState(false)
  const [showDummyDialog, setShowDummyDialog] = useState(false)
  const [showQuickMenu, setShowQuickMenu] = useState(false)
  const [clearFlashUntil, setClearFlashUntil] = useState(0)
  const [dummyHidden, setDummyHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dummyHidden') === 'true'
    } catch {
      return false
    }
  })
  const charge = useGame((s) => s.charge)
  const hits = useGame((s) => s.hits)
  const throwsCount = useGame((s) => s.throws)
  const dummyHits = useGame((s) => s.dummyHits)
  const dummyDamage = useGame((s) => s.dummyDamage)
  const selectedKind = useGame((s) => s.selectedKind)
  const setSelectedKind = useGame((s) => s.setSelectedKind)
  const cycleKind = useGame((s) => s.cycleKind)
  const clearSplats = useGame((s) => s.clearSplats)
  useEffect(() => {
    preloadAll()
    installGlobalErrorSuppressor()
    // Background music for the rage room. Browsers may block the first
    // autoplay attempt; the next user gesture (any click) will succeed.
    playMusic('rage')
    return () => stopMusic()
  }, [])

  // Session-state sound cues. Subscribe to the zustand store so we don't have
  // to re-render this component to fire-and-forget audio.
  useEffect(() => {
    let prevActive = useGame.getState().sessionActive
    let prevCombo = useGame.getState().combo
    let prevRage = useGame.getState().ragePct
    let rageMaxedAt = 0
    const unsub = useGame.subscribe((s) => {
      if (s.sessionActive !== prevActive) {
        if (s.sessionActive) playSfx('sessionStart')
        else playSfx('sessionEnd')
        prevActive = s.sessionActive
      }
      // Combo milestones — only fire on the threshold crossings, not every hit.
      const milestones = [3, 6, 12, 20, 35, 50]
      if (s.combo > prevCombo) {
        for (const m of milestones) {
          if (prevCombo < m && s.combo >= m) { playSfx('comboUp'); break }
        }
      }
      prevCombo = s.combo
      // Rage maxed — debounce so we only play once per refill.
      if (s.ragePct >= 0.99 && prevRage < 0.99 && performance.now() - rageMaxedAt > 4000) {
        playSfx('rageMax')
        rageMaxedAt = performance.now()
      }
      prevRage = s.ragePct
    })
    return () => unsub()
  }, [])

  // Time pool ticker — decrement timeRemainingMs while pointer-locked and playing
  useEffect(() => {
    if (!locked) return
    let raf = 0
    let last = performance.now()
    const loop = () => {
      const now = performance.now()
      const dt = now - last
      last = now
      if (useGame.getState().timeRemainingMs > 0) {
        spendTime(dt)
      } else {
        // Out of time — force release & open store
        document.exitPointerLock?.()
        setShowStore(true)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [locked, spendTime])

  useEffect(() => {
    console.log('[Game] photoUrl state', {
      photoUrlState,
      dummyPhotoUrlState,
      dummyHidden,
    })
  }, [photoUrlState, dummyPhotoUrlState, dummyHidden])

  useEffect(() => {
    setPhotoUrl(photoUrlState)
  }, [photoUrlState, setPhotoUrl])

  useEffect(() => {
    setDummyPhotoUrl(dummyPhotoUrlState)
  }, [dummyPhotoUrlState, setDummyPhotoUrl])

  useEffect(() => {
    try {
      localStorage.setItem('dummyHidden', dummyHidden ? 'true' : 'false')
    } catch {
      // ignore storage write failures
    }
  }, [dummyHidden])

  // Whenever the store opens, make sure the cursor is freed
  useEffect(() => {
    if (showStore && document.pointerLockElement) {
      document.exitPointerLock?.()
    }
  }, [showStore])

  const addThrow = (spec: ThrowSpec) => setThrows((t) => [...t, spec])
  const removeThrow = (id: number) =>
    setThrows((t) => t.filter((x) => x.id !== id))

  // Pipe incoming remote throws into the same projectile queue.
  useEffect(() => {
    registerRemoteThrowHandler((spec) => addThrow(spec))
    return () => registerRemoteThrowHandler(null)
  }, [])

  useEffect(() => {
    const handler = () => setLocked(document.pointerLockElement !== null)
    document.addEventListener('pointerlockchange', handler)
    return () => document.removeEventListener('pointerlockchange', handler)
  }, [])

  useEffect(() => {
    console.log('[Game] locked state:', { locked })
  }, [locked])

  useEffect(() => {
    // Number keys 1-4 select ammo
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, ProjectileKind> = {
        '1': 'tomato',
        '2': 'egg',
        '3': 'banana',
        '4': 'cake',
        '5': 'shit',
        '6': 'paint',
        '7': 'water',
        '8': 'rock',
        '9': 'brick',
        '0': 'bowlingBall',
        c: 'chair',
        t: 'tv',
        g: 'gun',
      }
      const k = e.key.toLowerCase()

      // B = open the buy / menu overlay (releases pointer lock so cursor returns)
      if (k === 'b') {
        document.exitPointerLock?.()
        setShowStore(true)
        return
      }
      // M / Tab = release lock & open the game menu (not the store)
      if (k === 'm' || e.key === 'Tab') {
        e.preventDefault()
        document.exitPointerLock?.()
        setShowQuickMenu(true)
        console.log('[Game] open quick menu via key', { key: e.key })
        return
      }
      // Escape: if pointer locked, free cursor; otherwise open quick menu
      if (e.key === 'Escape') {
        if (document.pointerLockElement) {
          document.exitPointerLock?.()
        } else {
          setShowQuickMenu((s) => !s)
        }
        return
      }

      if (map[k]) {
        setSelectedKind(map[k])
        return
      }
      if (k === 'q') cycleKind(-1)
      if (k === 'e') cycleKind(1)
      // X = wipe all splats (wall + dummy + world). Works whether locked or not.
      if (k === 'x') {
        clearSplats()
        useWorldSplats.getState().clear()
        setClearFlashUntil(performance.now() + 700)
      }
    }
    const onWheel = (e: WheelEvent) => {
      if (document.pointerLockElement === null) return
      e.preventDefault()
      cycleKind(e.deltaY > 0 ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
    }
  }, [setSelectedKind, cycleKind, clearSplats])

  function handleFile(file: File) {
    fileToCompressedDataUrl(file, 1024, 0.85)
      .then((url) => {
        console.log('[handleFile] new wall photo:', { fileName: file.name, original: file.size, compressed: url.length })
        setPhotoUrlState(url)
      })
      .catch((err) => {
        console.error('[handleFile] failed to compress, using blob fallback', err)
        setPhotoUrlState(URL.createObjectURL(file))
      })
  }
  function handleDummyFile(file: File) {
    fileToCompressedDataUrl(file, 1024, 0.85)
      .then((url) => {
        console.log('[handleDummyFile] new dummy face:', { fileName: file.name, original: file.size, compressed: url.length })
        setDummyPhotoUrlState(url)
      })
      .catch((err) => {
        console.error('[handleDummyFile] failed to compress, using blob fallback', err)
        setDummyPhotoUrlState(URL.createObjectURL(file))
      })
  }

  return (
    <ErrorBoundary
      label="Game"
      recoverable
      recoverMs={2000}
      fallback={
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontFamily: 'system-ui' }}>
          Recovering…
        </div>
      }
    >
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 200 }}
        onPointerDown={() => {
          const startOverlayOpen = !locked && !showStore
          if (startOverlayOpen) return // don't steal pointer while start overlay is visible
          if (!photoUrlState && !dummyPhotoUrlState) return
          const el = document.querySelector('canvas') as HTMLCanvasElement | null
          if (el && document.pointerLockElement !== el) el.requestPointerLock?.()
        }}
      >
        <color attach="background" args={['#1f2937']} />
        <ambientLight intensity={0.8} />
        <directionalLight
          position={[8, 14, 10]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
        />
        <hemisphereLight args={['#ffffff', '#525252', 0.4]} />
        {/* Subtle spot from above the wall so the photo stays legible */}
        <spotLight
          position={[0, 5.5, -9]}
          target-position={[0, 2.75, -12]}
          angle={0.6}
          penumbra={0.6}
          intensity={8}
          distance={14}
          color="#fef3c7"
        />

        <Physics gravity={[0, -9.81, 0]}>
          <ErrorBoundary label="Room"><Room /></ErrorBoundary>
          <ErrorBoundary label="Wall" recoverable><Wall photoUrl={photoUrlState} /></ErrorBoundary>
          <ErrorBoundary label="Props" recoverable><Props /></ErrorBoundary>
          <ErrorBoundary label="HateWalls" recoverable><HateWalls /></ErrorBoundary>
          {!dummyHidden && (
            <ErrorBoundary label="Dummy" recoverable>
              <Dummy photoUrl={dummyPhotoUrlState ?? photoUrlState} />
            </ErrorBoundary>
          )}
          <ErrorBoundary label="Player"><Player onThrow={addThrow} /></ErrorBoundary>
          <ErrorBoundary label="RemotePlayers" recoverable><RemotePlayers /></ErrorBoundary>
          <ErrorBoundary label="Projectiles" recoverable>
            <Projectiles throws={throws} onLanded={removeThrow} />
          </ErrorBoundary>
        </Physics>
        <ErrorBoundary label="CameraEffects" recoverable><CameraEffects /></ErrorBoundary>
        <ErrorBoundary label="Trajectory" recoverable><Trajectory /></ErrorBoundary>
        <ErrorBoundary label="WorldSplats" recoverable><WorldSplats /></ErrorBoundary>
        <ErrorBoundary label="SessionTicker" recoverable><SessionTicker /></ErrorBoundary>
      </Canvas>

      <ErrorBoundary label="MultiplayerHUD"><MultiplayerHUD /></ErrorBoundary>
      <MuteChip />

      <div className="hud">
        <ErrorBoundary label="SessionTimer"><SessionTimer /></ErrorBoundary>
        <ErrorBoundary label="ChaosHUD"><ChaosHUD /></ErrorBoundary>
        <div className="stats">
          Wall: <b>{hits}</b> &nbsp;·&nbsp; Dummy: <b>{dummyHits}</b>
          {dummyDamage > 0 && <> ({dummyDamage} dmg)</>}
          &nbsp;·&nbsp; Throws: <b>{throwsCount}</b>
          {throwsCount > 0 && (
            <> &nbsp;·&nbsp; {Math.round(((hits + dummyHits) / throwsCount) * 100)}%</>
          )}
        </div>
        <div className="credits" style={{ pointerEvents: 'auto' }}>
          <span
            className="cr-amt"
            style={{ color: timeRemainingMs < 60_000 ? '#ef4444' : '#facc15' }}
            title="Time remaining"
          >
            ⏱ {formatTime(timeRemainingMs)}
          </span>
          <button className="cr-buy" onClick={() => setShowStore(true)} title="Buy more time (B)">
            Buy <kbd>B</kbd>
          </button>
          <button className="cr-buy" onClick={() => setShowQuickMenu(true)} title="Open menu (Esc)" style={{ background: '#52525b', color: '#fff' }}>
            Menu <kbd>Esc</kbd>
          </button>
        </div>

        {locked && (
          <div className="lock-hint">
            <kbd>Esc</kbd> free cursor &nbsp;·&nbsp;
            <kbd>B</kbd> store &nbsp;·&nbsp;
            <kbd>X</kbd> clean &nbsp;·&nbsp;
            <kbd>M</kbd> menu
          </div>
        )}

        <ClearFlash until={clearFlashUntil} />
        <div className="crosshair" />
        <div className="charge-bar">
          <div className="fill" style={{ width: `${charge * 100}%` }} />
        </div>
        <div className="ammo">
          <button className="cycle" onClick={() => cycleKind(-1)} title="Q">‹</button>
          {KIND_ORDER.map((k, i) => {
            const info = KIND_INFO[k]
            const outOfTime = timeRemainingMs <= 0
            return (
              <button
                key={k}
                className={
                  'slot' +
                  (k === selectedKind ? ' active' : '') +
                  (outOfTime ? ' broke' : '')
                }
                onClick={() => setSelectedKind(k)}
                title={`${info.label} (${KEY_LABEL[k] ?? '–'})`}
              >
                <span className="thumb">{info.emoji}</span>
                <span className="key">{KEY_LABEL[k] ?? (i + 1).toString()}</span>
                {k === selectedKind && <span className="lbl">{info.label}</span>}
              </button>
            )
          })}
          <button className="cycle" onClick={() => cycleKind(1)} title="E">›</button>
        </div>
      </div>

      {/* Inline start panel (modal removed) so uploads stay visible */}
      <div className="start-inline">
        <div className="panel start-panel inline">
          <header className="hero">
            <h1>Wall of Anger</h1>
            <p className="tagline">Upload a photo. Throw stuff. Feel better.</p>
          </header>

          <section className="upload-row">
            <UploadCard
              label="Wall photo"
              url={photoUrlState}
              accent="#22c55e"
              inputId="wall-photo-input"
              onFile={handleFile}
              onClear={() => {
                setPhotoUrlState(null)
              }}
            />
            <UploadCard
              label="Dummy face"
              url={dummyPhotoUrlState}
              accent="#f97316"
              inputId="dummy-photo-input"
              onFile={handleDummyFile}
              onClear={() => {
                setDummyPhotoUrlState(null)
              }}
            />
          </section>

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setShowWallDialog(true)} className="subtle">
              Edit wall background
            </button>
            <button type="button" onClick={() => setShowDummyDialog(true)} className="subtle">
              Edit dummy background
            </button>
            <button type="button" onClick={() => setShowQuickMenu(true)} className="subtle">
              Menu
            </button>
          </div>

          <div className="play-row">
            <button
              className={'play-cta' + (!photoUrlState && !dummyPhotoUrlState ? ' disabled' : '')}
              onClick={() => {
                const el = document.querySelector('canvas') as HTMLCanvasElement | null
                el?.requestPointerLock?.()
              }}
              disabled={!photoUrlState && !dummyPhotoUrlState}
            >
              {!photoUrlState && !dummyPhotoUrlState ? 'Upload a photo first' : '▶ Play'}
            </button>
            {(photoUrlState || dummyPhotoUrlState) && (
              <button className="clear-btn" onClick={() => clearSplats()}>
                Clear splats
              </button>
            )}
          </div>
        </div>
      </div>
      <BackgroundDialog
        open={showWallDialog}
        label="Edit Wall Background"
        initialUrl={photoUrlState}
        onClose={() => setShowWallDialog(false)}
        onSave={(url) => setPhotoUrlState(url)}
      />
      <BackgroundDialog
        open={showDummyDialog}
        label="Edit Dummy Background"
        initialUrl={dummyPhotoUrlState ?? photoUrlState}
        onClose={() => setShowDummyDialog(false)}
        onSave={(url) => setDummyPhotoUrlState(url)}
      />
      {showQuickMenu && (
        <div className="overlay" onClick={() => setShowQuickMenu(false)}>
          <div className="panel quick-menu" onClick={(e) => e.stopPropagation()}>
            <h2>Quick Menu</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => {
                  setDummyHidden((prev) => !prev)
                }}
              >
                {dummyHidden ? 'Show dummy' : 'Hide dummy'}
              </button>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); setShowQuickMenu(false) }} />
                Upload wall image
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDummyFile(f); setShowQuickMenu(false) }} />
                Upload dummy image
              </label>
              <button onClick={() => { setShowStore(true); setShowQuickMenu(false) }}>Top up credits</button>
              <button onClick={() => setShowQuickMenu(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showStore && (
        <div className="overlay" onClick={() => setShowStore(false)}>
          <div className="panel store" onClick={(e) => e.stopPropagation()}>
            <h1>Buy Rage Time</h1>
            <p style={{ opacity: 0.7 }}>Powered by PayMongo · pay in PHP</p>
            <p style={{ opacity: 0.85, fontSize: 14, marginBottom: 8 }}>
              Time remaining: <b style={{ color: '#facc15' }}>{formatTime(timeRemainingMs)}</b>
            </p>
            <div className="packs">
              {TIME_PACKS.map((p) => (
                <button
                  key={p.id}
                  className={'pack' + (p.popular ? ' popular' : '')}
                  onClick={async () => {
                    const apiBase = (import.meta as any).env?.VITE_API_BASE_URL ?? ''
                    const { getAccessToken } = await import('./auth')
                    const token = await getAccessToken()
                    if (!token) {
                      alert('You need to sign in before purchasing.')
                      return
                    }
                    try {
                      const res = await fetch(`${apiBase}/api/payments/checkout`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ packId: p.id }),
                      })
                      if (!res.ok) {
                        const msg = await res.text().catch(() => res.statusText)
                        alert(`Checkout failed (${res.status}): ${msg}`)
                        return
                      }
                      const { checkoutUrl } = await res.json()
                      window.location.href = checkoutUrl
                    } catch (e: any) {
                      alert(`Network error reaching API: ${e?.message ?? e}`)
                    }
                  }}
                >
                  {p.popular && <span className="badge">Best Value</span>}
                  <div className="title">{p.label}</div>
                  <div className="amt">{p.hours}h</div>
                  <div className="price">₱{p.pesos}</div>
                  <div className="bonus">
                    {(p.pesos / p.hours).toFixed(p.pesos / p.hours < 1 ? 2 : 1)} ₱/hr
                  </div>
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, opacity: 0.6, marginTop: 16 }}>
              Time decrements only while you're actively in the room. Bigger packs = lower hourly rate.
            </p>
            <button onClick={() => setShowStore(false)} style={{ background: '#52525b', color: '#fff' }}>
              Close
            </button>
          </div>
        </div>
      )}

      <ErrorBoundary label="SummaryScreen" recoverable><SummaryScreen /></ErrorBoundary>
    </ErrorBoundary>
  )
}

interface UploadCardProps {
  label: string
  url: string | null
  accent: string
  inputId: string
  onFile: (f: File) => void
  onClear: () => void
}

function UploadCard({ label, url, accent, inputId, onFile, onClear }: UploadCardProps) {
  return (
    <div className={'upload-card' + (url ? ' filled' : '')}>
      {/* Native <label> for input: most reliable cross-browser way to open file picker */}
      <label
        className="picker"
        style={{ borderColor: url ? accent : undefined, cursor: 'pointer' }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          console.log('[UploadCard] label click', { inputId })
          const inp = document.getElementById(inputId) as HTMLInputElement | null
          if (inp) inp.click()
        }}
        aria-label={label}
      >
        {url ? (
          <img src={url} alt={label} className="preview" />
        ) : (
          <div className="placeholder" style={{ color: accent }}>
            <span className="plus">+</span>
            <span className="hint">Add</span>
          </div>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onClick={() => console.log('[UploadCard] input clicked', { inputId })}
        onChange={(e) => {
          console.log('[UploadCard] input onChange', { inputId, files: e.target.files })
          const f = e.target.files?.[0]
          if (f) {
            console.log('[UploadCard] file selected', { inputId, fileName: f.name, fileType: f.type })
            onFile(f)
          }
          // Reset so picking the same file again still fires onChange
          e.target.value = ''
        }}
      />
      <div className="meta">
        <span className="card-label">{label}</span>
        <button
          type="button"
          className={'card-action' + (url ? '' : ' primary')}
          onClick={(e) => {
            e.preventDefault()
            console.log('[UploadCard] action click', { inputId })
            const inp = document.getElementById(inputId) as HTMLInputElement | null
            if (inp) inp.click()
          }}
          style={!url ? { background: accent, cursor: 'pointer' } : { cursor: 'pointer' }}
          aria-label={url ? 'Change photo' : 'Upload photo'}
        >
          {url ? 'Change' : 'Upload'}
        </button>
        {url && (
          <button className="card-action subtle" onClick={onClear} title="Remove photo">
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

function ClearFlash({ until }: { until: number }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (until <= performance.now()) {
      setVisible(false)
      return
    }
    setVisible(true)
    const remaining = until - performance.now()
    const t = setTimeout(() => setVisible(false), remaining)
    return () => clearTimeout(t)
  }, [until])
  if (!visible) return null
  return (
    <div className="clear-toast">
      <span className="icon">🧽</span>
      <span>Mess cleared</span>
    </div>
  )
}

function BackgroundDialog({
  open,
  label,
  initialUrl,
  onClose,
  onSave,
}: {
  open: boolean
  label: string
  initialUrl: string | null
  onClose: () => void
  onSave: (url: string | null) => void
}) {
  const [preview, setPreview] = useState<string | null>(initialUrl)

  if (!open) return null

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{label}</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 160, height: 120, background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {preview ? <img src={preview} style={{ maxWidth: '100%', maxHeight: '100%' }} /> : <span style={{ opacity: 0.6 }}>No preview</span>}
          </div>
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const r = new FileReader()
                r.onload = () => setPreview(r.result as string)
                r.readAsDataURL(f)
              }}
            />
            <div style={{ marginTop: 12 }}>
              <button onClick={() => { onSave(preview); onClose() }} disabled={!preview}>
                Save
              </button>
              <button onClick={onClose} style={{ marginLeft: 8 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
