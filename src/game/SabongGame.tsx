import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { SabongArena, ARENA_RADIUS } from './SabongArena'
import { ErrorBoundary } from './ErrorBoundary'
import { useMultiplayer } from './multiplayer'
import { getRoom, sendRoomMessage, leaveRoom } from './net'

// Sabong = top-down arena fight, but rendered in the same 3D environment as
// the rage room. Each player is a rooster (capsule + comb + beak). Click pecks
// the opponent if they're in front and within range — server adjudicates HP.

const ROOSTER_EYE = 1.1
const ROOSTER_SPEED = 7.5
// Jump physics — flap takes them well over head height; peak ≈ 2.9m above eye.
const JUMP_V = 9.0
const GRAVITY = 14
const GROUND_Y = ROOSTER_EYE
// Visual scale applied to the opponent's bird model — tune size without
// re-numbering every position inside <Rooster>.
const ROOSTER_SCALE = 0.78

interface BirdView {
  id: string
  name: string
  color: string
  x: number
  y: number
  z: number
  ry: number
  hp: number
  alive: boolean
}

interface RoomView {
  phase: 'waiting' | 'fighting' | 'over'
  winner: string
  birds: BirdView[]
}

function readRoomState(): RoomView {
  const r = getRoom()
  if (!r) return { phase: 'waiting', winner: '', birds: [] }
  const s: any = r.state
  const birds: BirdView[] = []
  s?.birds?.forEach?.((b: any) => {
    birds.push({
      id: b.id, name: b.name, color: b.color,
      x: b.x, y: b.y, z: b.z, ry: b.ry,
      hp: b.hp, alive: b.alive,
    })
  })
  return { phase: s?.phase ?? 'waiting', winner: s?.winner ?? '', birds }
}

// Peck animation timestamps, keyed by bird id. Mutated outside React so useFrame
// in any rooster can read without re-rendering. performance.now() of the peck start.
export const peckStartTimes = new Map<string, number>()
export const PECK_ANIM_MS = 280

export function SabongGame() {
  const [view, setView] = useState<RoomView>(() => readRoomState())
  const myId = useMultiplayer((s) => s.myId)
  const [peckFlash, setPeckFlash] = useState(0)
  const [hitFlash, setHitFlash] = useState(0)

  // Subscribe to room state changes. Colyseus 0.16 emits onStateChange.
  useEffect(() => {
    const r = getRoom()
    if (!r) return
    const sync = () => setView(readRoomState())
    r.onStateChange(sync)
    r.onMessage('peckHit', (p: { from: string; to: string; hp: number }) => {
      peckStartTimes.set(p.from, performance.now())
      if (p.to === myId) setHitFlash(performance.now())
      if (p.from === myId) setPeckFlash(performance.now())
    })
    r.onMessage('peckMiss', (p: { from: string }) => {
      peckStartTimes.set(p.from, performance.now())
      if (p.from === myId) setPeckFlash(performance.now())
    })
    sync()
  }, [myId])

  useEffect(() => () => { /* leave on unmount */ leaveRoom() }, [])

  const me = view.birds.find((b) => b.id === myId)
  const opponent = view.birds.find((b) => b.id !== myId)

  return (
    <>
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 200 }}
        onPointerDown={() => {
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
        />
        <hemisphereLight args={['#ffffff', '#525252', 0.4]} />

        <Physics gravity={[0, -9.81, 0]}>
          <ErrorBoundary label="SabongArena"><SabongArena /></ErrorBoundary>
          <ErrorBoundary label="RoosterControls">
            <RoosterController phase={view.phase} alive={me?.alive ?? true} />
          </ErrorBoundary>
          <ErrorBoundary label="RemoteRoosters" recoverable>
            <RemoteRoosters birds={view.birds.filter((b) => b.id !== myId)} />
          </ErrorBoundary>
        </Physics>
      </Canvas>

      <SabongHUD view={view} me={me} opponent={opponent} peckFlash={peckFlash} hitFlash={hitFlash} myId={myId} />
    </>
  )
}

function RoosterController({ phase, alive }: { phase: string; alive: boolean }) {
  const { camera } = useThree()
  const posRef = useRef(new THREE.Vector3(0, ROOSTER_EYE, 0))
  const vyRef = useRef(0)
  const groundedRef = useRef(true)
  const lastPoseEmitRef = useRef(0)
  const initialized = useRef(false)
  const myId = useMultiplayer.getState().myId

  // Spawn at the position the server gave us for our bird.
  useEffect(() => {
    if (initialized.current) return
    const me = readRoomState().birds.find((b) => b.id === myId)
    if (me) {
      posRef.current.set(me.x, ROOSTER_EYE, me.z)
      camera.position.copy(posRef.current)
      camera.rotation.y = me.ry
      initialized.current = true
    }
  }, [camera, myId])

  // Movement keys + jump (Space). Roosters can flap-jump a bit higher than a
  // normal hop — gives the peck-from-above feel.
  const keys = useRef({ w: false, a: false, s: false, d: false })
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase() as keyof typeof keys.current
      if (k in keys.current) keys.current[k] = true
      if (e.code === 'Space' && groundedRef.current && alive) {
        vyRef.current = JUMP_V
        groundedRef.current = false
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase() as keyof typeof keys.current
      if (k in keys.current) keys.current[k] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [alive])

  // Click = peck. Server adjudicates hit.
  const localPeckStart = useRef(0)
  useEffect(() => {
    const onClick = () => {
      if (phase !== 'fighting' || !alive) return
      if (document.pointerLockElement === null) return
      sendRoomMessage('peck')
      localPeckStart.current = performance.now()
      const mid = useMultiplayer.getState().myId
      if (mid) peckStartTimes.set(mid, localPeckStart.current)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [phase, alive])

  useFrame((_, dt) => {
    if (!alive) return
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    const move = new THREE.Vector3()
    if (keys.current.w) move.add(forward)
    if (keys.current.s) move.sub(forward)
    if (keys.current.d) move.add(right)
    if (keys.current.a) move.sub(right)
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(ROOSTER_SPEED * dt)

    posRef.current.add(move)
    // Clamp inside the circular arena
    const r = Math.hypot(posRef.current.x, posRef.current.z)
    const maxR = ARENA_RADIUS - 0.5
    if (r > maxR) {
      const k = maxR / r
      posRef.current.x *= k
      posRef.current.z *= k
    }

    // Vertical: gravity + jump integration
    vyRef.current -= GRAVITY * dt
    posRef.current.y += vyRef.current * dt
    if (posRef.current.y <= GROUND_Y) {
      posRef.current.y = GROUND_Y
      vyRef.current = 0
      groundedRef.current = true
    }

    // First-person peck animation: lunge camera forward+down on a fast ease-out,
    // recover with a softer ease-in. Pure useFrame, no tween dep needed.
    const elapsed = performance.now() - localPeckStart.current
    let lungeForward = 0
    let lungeDown = 0
    if (elapsed >= 0 && elapsed < PECK_ANIM_MS) {
      const t = elapsed / PECK_ANIM_MS
      // 0..0.4 = strike (ease-out cubic), 0.4..1 = recover (ease-in quad)
      if (t < 0.4) {
        const k = t / 0.4
        const eased = 1 - Math.pow(1 - k, 3)
        lungeForward = eased * 0.22
        lungeDown = eased * 0.08
      } else {
        const k = (t - 0.4) / 0.6
        const eased = 1 - k * k
        lungeForward = eased * 0.22
        lungeDown = eased * 0.08
      }
    }
    camera.position.copy(posRef.current)
    if (lungeForward > 0) {
      camera.position.addScaledVector(forward, lungeForward)
      camera.position.y -= lungeDown
    }

    // Throttle pose emit ~20Hz
    const now = performance.now()
    if (now - lastPoseEmitRef.current > 50) {
      lastPoseEmitRef.current = now
      sendRoomMessage('pose', {
        x: posRef.current.x,
        y: posRef.current.y,
        z: posRef.current.z,
        ry: camera.rotation.y,
      })
    }
  })

  return <PointerLockControls />
}

function RemoteRoosters({ birds }: { birds: BirdView[] }) {
  return (
    <>
      {birds.map((b) => <Rooster key={b.id} bird={b} />)}
    </>
  )
}

function Rooster({ bird }: { bird: BirdView }) {
  const ref = useRef<THREE.Group>(null)
  const headRef = useRef<THREE.Group>(null)
  const bodyRef = useRef<THREE.Group>(null)
  const leftWingRef = useRef<THREE.Group>(null)
  const rightWingRef = useRef<THREE.Group>(null)
  const leftLegRef = useRef<THREE.Group>(null)
  const rightLegRef = useRef<THREE.Group>(null)
  const lastPosRef = useRef(new THREE.Vector3(bird.x, 0, bird.z))
  useFrame(() => {
    if (!ref.current) return
    const lift = Math.max(0, bird.y - GROUND_Y)
    const target = new THREE.Vector3(bird.x, lift, bird.z)
    const horizDelta = Math.hypot(target.x - lastPosRef.current.x, target.z - lastPosRef.current.z)
    lastPosRef.current.copy(target)
    ref.current.position.lerp(target, 0.25)
    ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, bird.ry, 0.25)
    ref.current.visible = bird.alive

    // Peck animation
    const start = peckStartTimes.get(bird.id) ?? 0
    const elapsed = performance.now() - start
    let strike = 0
    if (start > 0 && elapsed >= 0 && elapsed < PECK_ANIM_MS) {
      const t = elapsed / PECK_ANIM_MS
      strike = t < 0.4
        ? 1 - Math.pow(1 - t / 0.4, 3)
        : 1 - Math.pow((t - 0.4) / 0.6, 2)
    }
    if (headRef.current) {
      headRef.current.position.z = -0.35 - strike * 0.5
      headRef.current.position.y = 1.65 - strike * 0.22
      headRef.current.rotation.x = strike * 0.9
    }
    if (bodyRef.current) {
      bodyRef.current.rotation.x = strike * 0.18
    }

    // Walk cycle — legs swing opposite phases when moving, hang still at rest.
    const walking = horizDelta > 0.01
    const tt = performance.now() / 1000
    const swing = walking ? Math.sin(tt * 12) * 0.5 : 0
    if (leftLegRef.current)  leftLegRef.current.rotation.x  = swing
    if (rightLegRef.current) rightLegRef.current.rotation.x = -swing

    // Wing flap — fast and wide while airborne, soft while walking, near-tucked at rest.
    const airborne = lift > 0.05
    const flapAmp = airborne ? 1.0 : walking ? 0.35 : 0.08
    const flapSpeed = airborne ? 22 : 8
    const flap = Math.sin(tt * flapSpeed) * flapAmp
    if (leftWingRef.current)  leftWingRef.current.rotation.z  = -0.25 - flap
    if (rightWingRef.current) rightWingRef.current.rotation.z =  0.25 + flap
  })
  return (
    <group ref={ref} scale={ROOSTER_SCALE}>
      {/* Legs (yellow). Pivot at hip so rotation.x swings the whole leg. */}
      <group ref={leftLegRef} position={[0.18, 0.55, 0]}>
        <mesh castShadow position={[0, -0.27, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.55, 8]} />
          <meshStandardMaterial color="#fbbf24" />
        </mesh>
        <mesh castShadow position={[0, -0.56, -0.06]}>
          <boxGeometry args={[0.18, 0.06, 0.28]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      </group>
      <group ref={rightLegRef} position={[-0.18, 0.55, 0]}>
        <mesh castShadow position={[0, -0.27, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.55, 8]} />
          <meshStandardMaterial color="#fbbf24" />
        </mesh>
        <mesh castShadow position={[0, -0.56, -0.06]}>
          <boxGeometry args={[0.18, 0.06, 0.28]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      </group>

      <group ref={bodyRef}>
        {/* Body — bigger, sitting on top of the legs */}
        <mesh castShadow position={[0, 0.95, 0]} scale={[1.1, 1, 1.25]}>
          <capsuleGeometry args={[0.42, 0.6, 8, 16]} />
          <meshStandardMaterial color={bird.color} />
        </mesh>
        {/* Tail fan — three angled feathers at the rear */}
        <group position={[0, 1.25, 0.45]} rotation={[0.5, 0, 0]}>
          <mesh castShadow position={[0, 0.15, 0]}>
            <boxGeometry args={[0.08, 0.5, 0.05]} />
            <meshStandardMaterial color={bird.color} />
          </mesh>
          <mesh castShadow position={[0.18, 0.1, 0]} rotation={[0, 0, -0.35]}>
            <boxGeometry args={[0.08, 0.45, 0.05]} />
            <meshStandardMaterial color={bird.color} />
          </mesh>
          <mesh castShadow position={[-0.18, 0.1, 0]} rotation={[0, 0, 0.35]}>
            <boxGeometry args={[0.08, 0.45, 0.05]} />
            <meshStandardMaterial color={bird.color} />
          </mesh>
        </group>
      </group>

      {/* Wings — pivot at the shoulder so rotation.z flaps them up/down. */}
      <group ref={leftWingRef} position={[0.48, 1.1, 0]}>
        <mesh castShadow position={[0.22, 0, 0]}>
          <boxGeometry args={[0.45, 0.5, 0.1]} />
          <meshStandardMaterial color={bird.color} />
        </mesh>
      </group>
      <group ref={rightWingRef} position={[-0.48, 1.1, 0]}>
        <mesh castShadow position={[-0.22, 0, 0]}>
          <boxGeometry args={[0.45, 0.5, 0.1]} />
          <meshStandardMaterial color={bird.color} />
        </mesh>
      </group>

      {/* Head group — moved by peck animation. */}
      <group ref={headRef} position={[0, 1.65, -0.35]}>
        <mesh castShadow>
          <sphereGeometry args={[0.28, 16, 12]} />
          <meshStandardMaterial color={bird.color} />
        </mesh>
        {/* Comb (red) */}
        <mesh castShadow position={[0, 0.32, 0.06]}>
          <boxGeometry args={[0.06, 0.22, 0.38]} />
          <meshStandardMaterial color="#b91c1c" />
        </mesh>
        {/* Wattle (red dangle under beak) */}
        <mesh castShadow position={[0, -0.18, -0.18]}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>
        {/* Beak */}
        <mesh castShadow position={[0, -0.05, -0.28]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.08, 0.22, 8]} />
          <meshStandardMaterial color="#fbbf24" />
        </mesh>
        {/* Eyes */}
        <mesh position={[0.15, 0.05, -0.16]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color="#0a0a0a" />
        </mesh>
        <mesh position={[-0.15, 0.05, -0.16]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color="#0a0a0a" />
        </mesh>
      </group>

      {/* Name tag */}
      <NameTag name={bird.name} hp={bird.hp} />
    </group>
  )
}

function NameTag({ name, hp }: { name: string; hp: number }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 256; c.height = 96
    const ctx = c.getContext('2d')!
    ctx.fillStyle = 'rgba(12,12,12,0.85)'
    ctx.fillRect(0, 0, 256, 64)
    ctx.fillStyle = '#fef3c7'
    ctx.font = 'bold 28px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(name.slice(0, 14), 128, 40)
    // HP bar
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(16, 72, 224, 16)
    ctx.fillStyle = hp > 40 ? '#22c55e' : hp > 20 ? '#facc15' : '#dc2626'
    ctx.fillRect(16, 72, Math.max(0, Math.min(1, hp / 100)) * 224, 16)
    const t = new THREE.CanvasTexture(c)
    t.needsUpdate = true
    return t
  }, [name, hp])
  return (
    <sprite position={[0, 2.6, 0]} scale={[1.4, 0.5, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  )
}

function SabongHUD({
  view, me, opponent, peckFlash, hitFlash, myId,
}: { view: RoomView; me?: BirdView; opponent?: BirdView; peckFlash: number; hitFlash: number; myId: string | null }) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 100)
    return () => clearInterval(t)
  }, [])
  const now = performance.now()
  const peckGlow = Math.max(0, 1 - (now - peckFlash) / 300)
  const hitGlow = Math.max(0, 1 - (now - hitFlash) / 400)

  return (
    <>
      {hitGlow > 0 && (
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 30,
          boxShadow: `inset 0 0 ${120 * hitGlow}px ${40 * hitGlow}px rgba(220,38,38,${0.6 * hitGlow})`,
        }} />
      )}
      <div style={hudShell}>
        <BirdBadge bird={me} accent="#22c55e" label="YOU" peckGlow={peckGlow} />
        <div style={vs}>VS</div>
        <BirdBadge bird={opponent} accent="#dc2626" label={opponent ? 'OPP' : 'WAITING…'} peckGlow={0} />
      </div>

      <div style={centerHint}>
        {view.phase === 'waiting' && 'Waiting for opponent…'}
        {view.phase === 'fighting' && (
          <span style={{ opacity: 0.7 }}>
            Click to peck · WASD to move · Esc to free cursor
          </span>
        )}
        {view.phase === 'over' && (
          <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 36, letterSpacing: 2 }}>
            {view.winner === myId ? '🏆 YOU WIN' : view.winner ? '☠ DEFEATED' : 'DRAW'}
          </span>
        )}
      </div>

      {/* Crosshair */}
      <div style={crosshair} />
    </>
  )
}

function BirdBadge({ bird, accent, label, peckGlow }: { bird?: BirdView; accent: string; label: string; peckGlow: number }) {
  const hp = bird?.hp ?? 0
  return (
    <div style={{ ...badge, borderColor: accent, boxShadow: peckGlow > 0 ? `0 0 ${20 * peckGlow}px ${accent}` : undefined }}>
      <div style={{ fontSize: 10, letterSpacing: 2, opacity: 0.7 }}>{label}</div>
      <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, letterSpacing: 1 }}>
        {bird?.name ?? '—'}
      </div>
      <div style={hpTrack}>
        <div style={{ ...hpFill, width: `${hp}%`, background: hp > 40 ? '#22c55e' : hp > 20 ? '#facc15' : '#dc2626' }} />
      </div>
      <div style={{ fontSize: 11, opacity: 0.8 }}>{hp} HP</div>
    </div>
  )
}

const hudShell: React.CSSProperties = {
  position: 'fixed', top: 16, left: 0, right: 0, zIndex: 40,
  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16,
  pointerEvents: 'none', fontFamily: '"JetBrains Mono", monospace', color: '#f5f1e8',
}
const badge: React.CSSProperties = {
  background: 'rgba(12,12,12,0.85)', border: '2px solid',
  padding: '8px 14px', minWidth: 180,
}
const vs: React.CSSProperties = {
  fontFamily: 'Anton, sans-serif', fontSize: 32, color: '#facc15',
  textShadow: '2px 2px 0 #0c0c0c',
}
const hpTrack: React.CSSProperties = {
  marginTop: 6, height: 8, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
}
const hpFill: React.CSSProperties = { height: '100%', transition: 'width 0.15s' }
const centerHint: React.CSSProperties = {
  position: 'fixed', bottom: 24, left: 0, right: 0, zIndex: 40,
  textAlign: 'center', color: '#f5f1e8', fontFamily: '"JetBrains Mono", monospace',
  fontSize: 13, pointerEvents: 'none',
}
const crosshair: React.CSSProperties = {
  position: 'fixed', top: '50%', left: '50%', width: 6, height: 6,
  marginLeft: -3, marginTop: -3, background: '#fef3c7', borderRadius: '50%',
  pointerEvents: 'none', zIndex: 35, opacity: 0.7,
}
