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
  maxHp: number
  alive: boolean
  weapon: string
  weaponAmmo: number
  dmgMulUntil: number
  hasteUntil: number
  regenUntil: number
  immortalUntil: number
}

interface ItemView {
  id: string
  kind: string
  x: number
  z: number
}

interface RoomView {
  phase: 'waiting' | 'fighting' | 'over'
  winner: string
  birds: BirdView[]
  items: ItemView[]
  rematchReady: string[]
}

// Client mirror of the server WEAPONS table — used to decide whether to send
// 'peck' (melee) vs 'shoot' (ranged) and to label the HUD chip.
export const CLIENT_WEAPONS: Record<string, { ranged: boolean; label: string; emoji: string }> = {
  beak: { ranged: false, label: 'Beak', emoji: '🪶' },
  spear: { ranged: false, label: 'Spear', emoji: '🔱' },
  slingshot: { ranged: true, label: 'Slingshot', emoji: '🏹' },
  lightning: { ranged: true, label: 'Lightning', emoji: '⚡' },
}
export const CLIENT_ITEMS: Record<string, { label: string; color: string; emoji: string }> = {
  spear: { label: 'Spear', color: '#9ca3af', emoji: '🔱' },
  slingshot: { label: 'Slingshot', color: '#a3a3a3', emoji: '🏹' },
  lightning: { label: 'Lightning', color: '#facc15', emoji: '⚡' },
  doubleDamage: { label: 'Double Dmg', color: '#dc2626', emoji: '×2' },
  haste: { label: 'Haste', color: '#3b82f6', emoji: '💨' },
  regen: { label: 'Regen', color: '#22c55e', emoji: '🌿' },
  heal: { label: 'Heal +40', color: '#ef4444', emoji: '❤️' },
  immortal: { label: 'Immortal', color: '#e879f9', emoji: '✨' },
}

function readRoomState(): RoomView {
  const r = getRoom()
  if (!r) return { phase: 'waiting', winner: '', birds: [], items: [], rematchReady: [] }
  const s: any = r.state
  const birds: BirdView[] = []
  s?.birds?.forEach?.((b: any) => {
    birds.push({
      id: b.id, name: b.name, color: b.color,
      x: b.x, y: b.y, z: b.z, ry: b.ry,
      hp: b.hp, maxHp: b.maxHp ?? 100, alive: b.alive,
      weapon: b.weapon ?? 'beak',
      weaponAmmo: b.weaponAmmo ?? -1,
      dmgMulUntil: b.dmgMulUntil ?? 0,
      hasteUntil: b.hasteUntil ?? 0,
      regenUntil: b.regenUntil ?? 0,
      immortalUntil: b.immortalUntil ?? 0,
    })
  })
  const items: ItemView[] = []
  s?.items?.forEach?.((i: any) => items.push({ id: i.id, kind: i.kind, x: i.x, z: i.z }))
  const rematchReady: string[] = []
  s?.rematchReady?.forEach?.((sid: string) => rematchReady.push(sid))
  return { phase: s?.phase ?? 'waiting', winner: s?.winner ?? '', birds, items, rematchReady }
}

// Peck animation timestamps, keyed by bird id. Mutated outside React so useFrame
// in any rooster can read without re-rendering. performance.now() of the peck start.
export const peckStartTimes = new Map<string, number>()
export const PECK_ANIM_MS = 280

// Active ranged-shot beams (visual only). Drawn as fading lines for 220ms.
interface BeamEvent { from: string; sx: number; sz: number; ex: number; ez: number; weapon: string; start: number; hit: boolean }
export const activeBeams: BeamEvent[] = []
export const BEAM_MS = 220

export type CameraMode = 'first' | 'third'

export function SabongGame({ onExit }: { onExit?: () => void } = {}) {
  const [view, setView] = useState<RoomView>(() => readRoomState())
  const myId = useMultiplayer((s) => s.myId)
  const [peckFlash, setPeckFlash] = useState(0)
  const [hitFlash, setHitFlash] = useState(0)
  // Camera mode — default third so you can watch your own bird peck.
  const [camMode, setCamMode] = useState<CameraMode>(() => {
    try { return (localStorage.getItem('sabongCam') as CameraMode) || 'third' } catch { return 'third' }
  })
  useEffect(() => { try { localStorage.setItem('sabongCam', camMode) } catch { } }, [camMode])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'v') setCamMode((m) => m === 'first' ? 'third' : 'first')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
    const addBeam = (p: { from: string; ex: number; ez: number; weapon: string; to?: string }) => {
      const shooter = readRoomState().birds.find((b) => b.id === p.from)
      if (!shooter) return
      activeBeams.push({
        from: p.from, sx: shooter.x, sz: shooter.z, ex: p.ex, ez: p.ez,
        weapon: p.weapon, start: performance.now(), hit: !!p.to,
      })
      // GC old beams
      while (activeBeams.length > 16) activeBeams.shift()
      if (p.from === myId) setPeckFlash(performance.now())
      if (p.to === myId) setHitFlash(performance.now())
    }
    r.onMessage('shotHit', (p: any) => addBeam(p))
    r.onMessage('shotMiss', (p: any) => addBeam(p))
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
            <RoosterController phase={view.phase} alive={me?.alive ?? true} myBird={me} camMode={camMode} items={view.items} />
          </ErrorBoundary>
          <ErrorBoundary label="RemoteRoosters" recoverable>
            <RemoteRoosters birds={view.birds.filter((b) => b.id !== myId)} />
          </ErrorBoundary>
          <ErrorBoundary label="Items" recoverable>
            <Items items={view.items} />
          </ErrorBoundary>
          <ErrorBoundary label="Beams" recoverable>
            <Beams />
          </ErrorBoundary>
        </Physics>
      </Canvas>

      <SabongHUD
        view={view} me={me} opponent={opponent}
        peckFlash={peckFlash} hitFlash={hitFlash} myId={myId}
        camMode={camMode}
        onToggleCam={() => setCamMode((m) => m === 'first' ? 'third' : 'first')}
        onLeave={() => { leaveRoom(); onExit?.() }}
        onRematch={() => sendRoomMessage('rematch')}
      />
    </>
  )
}

interface RoosterControllerProps {
  phase: string
  alive: boolean
  myBird?: BirdView
  camMode: CameraMode
  items: ItemView[]
}

const THIRD_PERSON_BACK = 4
const THIRD_PERSON_UP = 1.5

function RoosterController({ phase, alive, myBird, camMode, items }: RoosterControllerProps) {
  const { camera } = useThree()
  const posRef = useRef(new THREE.Vector3(0, ROOSTER_EYE, 0))
  const vyRef = useRef(0)
  const groundedRef = useRef(true)
  const lastPoseEmitRef = useRef(0)
  const initialized = useRef(false)
  const myId = useMultiplayer.getState().myId

  // Refs for the local bird's visual model (only rendered in third-person).
  const localGroupRef = useRef<THREE.Group>(null)
  const localBodyRef = useRef<THREE.Group>(null)
  const localHeadRef = useRef<THREE.Group>(null)
  const localLeftWingRef = useRef<THREE.Group>(null)
  const localRightWingRef = useRef<THREE.Group>(null)
  const localLeftLegRef = useRef<THREE.Group>(null)
  const localRightLegRef = useRef<THREE.Group>(null)
  const lastLocalPosRef = useRef(new THREE.Vector3())
  // De-dupe pickup requests per item id; if server hasn't removed the item by
  // 400ms we'll retry.
  const pickupSentAt = useRef(new Map<string, number>())

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

  // Respawn snap: on rematch, server flips phase 'over' → 'waiting' and
  // resets our bird's position. Mirror that locally so we don't keep walking
  // from where we died.
  useEffect(() => {
    if (phase !== 'waiting') return
    const me = readRoomState().birds.find((b) => b.id === myId)
    if (!me) return
    posRef.current.set(me.x, ROOSTER_EYE, me.z)
    vyRef.current = 0
    groundedRef.current = true
    camera.position.copy(posRef.current)
    camera.rotation.y = me.ry
  }, [phase, myId, camera])

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

  // Click = attack. Melee weapons send 'peck', ranged weapons send 'shoot'
  // with the camera's xz aim direction.
  const localPeckStart = useRef(0)
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  useEffect(() => {
    const r = getRoom()
    if (!r) return
    r.onMessage('teleport', (p: { id: string; x: number; z: number }) => {
      if (p.id !== myId) return
      posRef.current.set(p.x, ROOSTER_EYE, p.z)
      camera.position.copy(posRef.current)
    })
  }, [myId, camera])
  useEffect(() => {
    const onClick = () => {
      if (phase !== 'fighting' || !alive) return
      if (document.pointerLockElement === null) return
      const weapon = myBird?.weapon ?? 'beak'
      const spec = CLIENT_WEAPONS[weapon] ?? CLIENT_WEAPONS.beak
      if (spec.ranged) {
        const fwd = new THREE.Vector3()
        cameraRef.current.getWorldDirection(fwd)
        sendRoomMessage('shoot', { dx: fwd.x, dz: fwd.z })
      } else {
        sendRoomMessage('peck')
      }
      localPeckStart.current = performance.now()
      const mid = useMultiplayer.getState().myId
      if (mid) peckStartTimes.set(mid, localPeckStart.current)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [phase, alive, myBird?.weapon])

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
    // Haste buff multiplies movement speed locally; server has no opinion on
    // walking velocity, just on attack/pickup ranges.
    const hasted = (myBird?.hasteUntil ?? 0) > Date.now()
    const speed = ROOSTER_SPEED * (hasted ? 1.6 : 1)
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt)

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
    // True yaw extracted from the forward vector (works regardless of pitch).
    // camera.rotation.y is unreliable when PointerLockControls has pitched the
    // camera up/down — it's a YXZ Euler internally, read as XYZ by three.js.
    const yaw = Math.atan2(-forward.x, -forward.z)

    if (camMode === 'first') {
      camera.position.copy(posRef.current)
      if (lungeForward > 0) {
        camera.position.addScaledVector(forward, lungeForward)
        camera.position.y -= lungeDown
      }
    } else {
      // Third-person: park camera behind the bird along the current yaw, raised.
      // The peck lunge zooms the camera *toward* the bird, which reads as a punch-in.
      camera.position.set(
        posRef.current.x - forward.x * THIRD_PERSON_BACK + forward.x * lungeForward,
        posRef.current.y + THIRD_PERSON_UP - lungeDown,
        posRef.current.z - forward.z * THIRD_PERSON_BACK + forward.z * lungeForward,
      )
    }

    // Drive the local bird's visual (third-person only)
    if (localGroupRef.current) {
      const visible = camMode === 'third' && alive
      localGroupRef.current.visible = visible
      if (visible) {
        const lift = Math.max(0, posRef.current.y - GROUND_Y)
        localGroupRef.current.position.set(posRef.current.x, lift, posRef.current.z)
        localGroupRef.current.rotation.y = yaw
        const horizDelta = Math.hypot(
          posRef.current.x - lastLocalPosRef.current.x,
          posRef.current.z - lastLocalPosRef.current.z,
        )
        lastLocalPosRef.current.copy(posRef.current)
        // Peck animation (head + body) — strike value reused for the same easing.
        const start = peckStartTimes.get(myId ?? '') ?? 0
        const peckElapsed = performance.now() - start
        let strike = 0
        if (start > 0 && peckElapsed >= 0 && peckElapsed < PECK_ANIM_MS) {
          const t = peckElapsed / PECK_ANIM_MS
          strike = t < 0.4
            ? 1 - Math.pow(1 - t / 0.4, 3)
            : 1 - Math.pow((t - 0.4) / 0.6, 2)
        }
        if (localHeadRef.current) {
          localHeadRef.current.position.z = -0.35 - strike * 0.5
          localHeadRef.current.position.y = 1.65 - strike * 0.22
          localHeadRef.current.rotation.x = strike * 0.9
        }
        if (localBodyRef.current) localBodyRef.current.rotation.x = strike * 0.18
        // Walk cycle + wing flap (same params as remote birds for consistency)
        const walking = horizDelta > 0.01
        const tt = performance.now() / 1000
        const swing = walking ? Math.sin(tt * 12) * 0.5 : 0
        if (localLeftLegRef.current) localLeftLegRef.current.rotation.x = swing
        if (localRightLegRef.current) localRightLegRef.current.rotation.x = -swing
        const airborne = lift > 0.05
        const flapAmp = airborne ? 1.0 : walking ? 0.35 : 0.08
        const flapSpeed = airborne ? 22 : 8
        const flap = Math.sin(tt * flapSpeed) * flapAmp
        if (localLeftWingRef.current) localLeftWingRef.current.rotation.z = -0.25 - flap
        if (localRightWingRef.current) localRightWingRef.current.rotation.z = 0.25 + flap
      }
    }

    // Auto-pickup: any item within 1.5m gets a pickup request. Server validates
    // proximity again and removes the item, so spamming is harmless.
    for (const it of items) {
      if (Math.hypot(it.x - posRef.current.x, it.z - posRef.current.z) <= 1.5) {
        const last = pickupSentAt.current.get(it.id) ?? 0
        if (performance.now() - last > 400) {
          pickupSentAt.current.set(it.id, performance.now())
          sendRoomMessage('pickup', { id: it.id })
        }
      }
    }

    // Throttle pose emit ~20Hz
    const now = performance.now()
    if (now - lastPoseEmitRef.current > 50) {
      lastPoseEmitRef.current = now
      sendRoomMessage('pose', {
        x: posRef.current.x,
        y: posRef.current.y,
        z: posRef.current.z,
        ry: yaw,
      })
    }
  })

  return (
    <>
      <PointerLockControls />
      {myBird && (
        <RoosterModel
          color={myBird.color}
          name={myBird.name}
          hp={myBird.hp}
          immortalUntil={myBird.immortalUntil}
          groupRef={localGroupRef}
          bodyRef={localBodyRef}
          headRef={localHeadRef}
          leftWingRef={localLeftWingRef}
          rightWingRef={localRightWingRef}
          leftLegRef={localLeftLegRef}
          rightLegRef={localRightLegRef}
        />
      )}
    </>
  )
}

function RemoteRoosters({ birds }: { birds: BirdView[] }) {
  return (
    <>
      {birds.map((b) => <Rooster key={b.id} bird={b} />)}
    </>
  )
}

interface RoosterModelProps {
  color: string
  name: string
  hp: number
  immortalUntil?: number
  groupRef: React.RefObject<THREE.Group | null>
  bodyRef: React.RefObject<THREE.Group | null>
  headRef: React.RefObject<THREE.Group | null>
  leftWingRef: React.RefObject<THREE.Group | null>
  rightWingRef: React.RefObject<THREE.Group | null>
  leftLegRef: React.RefObject<THREE.Group | null>
  rightLegRef: React.RefObject<THREE.Group | null>
}

// Pure visual — animations are driven by whoever owns the refs (remote bird's
// own useFrame for opponents, the controller for the local bird).
function RoosterModel({
  color, name, hp, immortalUntil,
  groupRef, bodyRef, headRef,
  leftWingRef, rightWingRef, leftLegRef, rightLegRef,
}: RoosterModelProps) {
  return (
    <group ref={groupRef} scale={ROOSTER_SCALE}>
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
        {/* Main body — slightly egg-shaped, fuller chest forward */}
        <mesh castShadow position={[0, 0.95, 0]} scale={[1.15, 1.0, 1.3]}>
          <sphereGeometry args={[0.48, 20, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Chest puff — small lighter-toned sphere out front */}
        <mesh castShadow position={[0, 0.78, -0.45]} scale={[0.95, 0.85, 0.9]}>
          <sphereGeometry args={[0.35, 16, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Neck — short cylinder connecting body to head */}
        <mesh castShadow position={[0, 1.35, -0.22]} rotation={[Math.PI / 6, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.22, 0.32, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Tail fan — three angled feathers at the rear */}
        <group position={[0, 1.25, 0.5]} rotation={[0.55, 0, 0]}>
          <mesh castShadow position={[0, 0.2, 0]}>
            <boxGeometry args={[0.09, 0.55, 0.05]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh castShadow position={[0.2, 0.13, 0]} rotation={[0, 0, -0.4]}>
            <boxGeometry args={[0.09, 0.5, 0.05]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh castShadow position={[-0.2, 0.13, 0]} rotation={[0, 0, 0.4]}>
            <boxGeometry args={[0.09, 0.5, 0.05]} />
            <meshStandardMaterial color={color} />
          </mesh>
          {/* Center sickle feather curving up */}
          <mesh castShadow position={[0, 0.5, 0.05]} rotation={[-0.3, 0, 0]}>
            <boxGeometry args={[0.06, 0.35, 0.04]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        </group>
      </group>

      <group ref={leftWingRef} position={[0.5, 1.05, 0]}>
        <mesh castShadow position={[0.22, 0, 0]}>
          <boxGeometry args={[0.45, 0.55, 0.12]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
      <group ref={rightWingRef} position={[-0.5, 1.05, 0]}>
        <mesh castShadow position={[-0.22, 0, 0]}>
          <boxGeometry args={[0.45, 0.55, 0.12]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>

      <group ref={headRef} position={[0, 1.65, -0.35]}>
        {/* Head — slightly squashed for a cockier silhouette */}
        <mesh castShadow scale={[1.05, 1.0, 1.1]}>
          <sphereGeometry args={[0.3, 18, 14]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Jagged comb — 4 triangular teeth instead of one block */}
        <JaggedComb />
        {/* Wattle (red dangle under beak) */}
        <mesh castShadow position={[0, -0.2, -0.18]}>
          <sphereGeometry args={[0.08, 10, 8]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>
        <mesh castShadow position={[0, -0.27, -0.12]} scale={[0.7, 0.7, 0.7]}>
          <sphereGeometry args={[0.07, 10, 8]} />
          <meshStandardMaterial color="#b91c1c" />
        </mesh>
        {/* Beak — sharper upper + lower halves */}
        <mesh castShadow position={[0, -0.04, -0.3]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.09, 0.26, 8]} />
          <meshStandardMaterial color="#fbbf24" />
        </mesh>
        <mesh castShadow position={[0, -0.13, -0.24]} rotation={[Math.PI / 2.2, 0, 0]}>
          <coneGeometry args={[0.07, 0.16, 8]} />
          <meshStandardMaterial color="#d97706" />
        </mesh>
        {/* Eyes — white sclera + dark pupil */}
        <mesh position={[0.16, 0.06, -0.18]}>
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshStandardMaterial color="#fafaf9" />
        </mesh>
        <mesh position={[-0.16, 0.06, -0.18]}>
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshStandardMaterial color="#fafaf9" />
        </mesh>
        <mesh position={[0.18, 0.06, -0.23]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#0a0a0a" />
        </mesh>
        <mesh position={[-0.18, 0.06, -0.23]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#0a0a0a" />
        </mesh>
      </group>

      <NameTag name={name} hp={hp} />
      {immortalUntil !== undefined && <ImmortalAura until={immortalUntil} />}
    </group>
  )
}

// 4 triangular teeth standing on the head — looks like a serrated comb.
function JaggedComb() {
  const teeth = [
    { x: -0.12, h: 0.18 },
    { x: -0.04, h: 0.26 },
    { x: 0.04, h: 0.26 },
    { x: 0.12, h: 0.18 },
  ]
  return (
    <group position={[0, 0.28, -0.02]}>
      {teeth.map((t, i) => (
        <mesh key={i} castShadow position={[0, t.h / 2, t.x]} rotation={[0, 0, 0]}>
          <coneGeometry args={[0.06, t.h, 4]} />
          <meshStandardMaterial color="#b91c1c" />
        </mesh>
      ))}
    </group>
  )
}

// Pulsing translucent sphere around the bird while immortal. Hidden otherwise.
function ImmortalAura({ until }: { until: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (!ref.current) return
    const remaining = until - Date.now()
    const active = remaining > 0
    ref.current.visible = active
    if (!active) return
    const t = performance.now() / 1000
    const pulse = 0.95 + Math.sin(t * 6) * 0.05
    ref.current.scale.setScalar(pulse)
    const mat = ref.current.material as THREE.MeshBasicMaterial
    // Flicker faster in the last 2 seconds as a "ending soon" cue
    if (remaining < 2000) {
      mat.opacity = 0.15 + Math.abs(Math.sin(t * 18)) * 0.25
    } else {
      mat.opacity = 0.22 + Math.sin(t * 3) * 0.05
    }
  })
  return (
    <mesh ref={ref} position={[0, 1.0, 0]}>
      <sphereGeometry args={[0.95, 24, 16]} />
      <meshBasicMaterial color="#e879f9" transparent depthWrite={false} />
    </mesh>
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
    if (leftLegRef.current) leftLegRef.current.rotation.x = swing
    if (rightLegRef.current) rightLegRef.current.rotation.x = -swing

    // Wing flap — fast and wide while airborne, soft while walking, near-tucked at rest.
    const airborne = lift > 0.05
    const flapAmp = airborne ? 1.0 : walking ? 0.35 : 0.08
    const flapSpeed = airborne ? 22 : 8
    const flap = Math.sin(tt * flapSpeed) * flapAmp
    if (leftWingRef.current) leftWingRef.current.rotation.z = -0.25 - flap
    if (rightWingRef.current) rightWingRef.current.rotation.z = 0.25 + flap
  })
  return (
    <RoosterModel
      color={bird.color}
      name={bird.name}
      hp={bird.hp}
      immortalUntil={bird.immortalUntil}
      groupRef={ref}
      bodyRef={bodyRef}
      headRef={headRef}
      leftWingRef={leftWingRef}
      rightWingRef={rightWingRef}
      leftLegRef={leftLegRef}
      rightLegRef={rightLegRef}
    />
  )
}

// In-world item drops. Each is a colored cube floating with a bob + slow spin
// and a sprite label so you can tell what it is at a glance.
function Items({ items }: { items: ItemView[] }) {
  return (
    <>
      {items.map((i) => <DropMesh key={i.id} item={i} />)}
    </>
  )
}

function DropMesh({ item }: { item: ItemView }) {
  const ref = useRef<THREE.Group>(null)
  const info = CLIENT_ITEMS[item.kind] ?? { label: item.kind, color: '#ffffff', emoji: '?' }
  useFrame(() => {
    if (!ref.current) return
    const t = performance.now() / 1000
    ref.current.position.y = 0.7 + Math.sin(t * 2 + item.x) * 0.15
    ref.current.rotation.y = t * 1.5
  })
  const labelTex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 256; c.height = 64
    const ctx = c.getContext('2d')!
    ctx.fillStyle = 'rgba(12,12,12,0.85)'
    ctx.fillRect(0, 0, 256, 64)
    ctx.strokeStyle = info.color
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, 252, 60)
    ctx.fillStyle = info.color
    ctx.font = 'bold 30px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${info.emoji} ${info.label}`, 128, 34)
    const tex = new THREE.CanvasTexture(c)
    tex.needsUpdate = true
    return tex
  }, [item.kind, info.color, info.emoji, info.label])
  return (
    <group position={[item.x, 0, item.z]}>
      <group ref={ref}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color={info.color} emissive={info.color} emissiveIntensity={0.3} />
        </mesh>
        <sprite position={[0, 0.7, 0]} scale={[1.5, 0.38, 1]}>
          <spriteMaterial map={labelTex} transparent depthWrite={false} />
        </sprite>
      </group>
      {/* Ground glow ring */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.6, 0.8, 32]} />
        <meshBasicMaterial color={info.color} transparent opacity={0.5} />
      </mesh>
    </group>
  )
}

// Ranged shot beams. Pull from the module-level activeBeams array. Each beam
// is a thin cylinder from shooter to endpoint, fading out over BEAM_MS.
function Beams() {
  const groupRef = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!groupRef.current) return
    const now = performance.now()
    // Drop expired beams
    for (let i = activeBeams.length - 1; i >= 0; i--) {
      if (now - activeBeams[i].start > BEAM_MS) activeBeams.splice(i, 1)
    }
    // Match group children count to beam count
    while (groupRef.current.children.length < activeBeams.length) {
      const geo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6)
      const mat = new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true })
      const mesh = new THREE.Mesh(geo, mat)
      groupRef.current.add(mesh)
    }
    while (groupRef.current.children.length > activeBeams.length) {
      groupRef.current.remove(groupRef.current.children[groupRef.current.children.length - 1])
    }
    activeBeams.forEach((b, i) => {
      const mesh = groupRef.current!.children[i] as THREE.Mesh
      const dx = b.ex - b.sx, dz = b.ez - b.sz
      const len = Math.hypot(dx, dz)
      const mx = (b.sx + b.ex) / 2
      const mz = (b.sz + b.ez) / 2
      mesh.position.set(mx, 1.2, mz)
      // Orient cylinder (default +Y) along the (dx, dz) vector
      mesh.rotation.set(0, 0, 0)
      mesh.rotateY(Math.atan2(dx, dz))
      mesh.rotateX(Math.PI / 2)
      mesh.scale.set(b.weapon === 'lightning' ? 1.5 : 1, len, b.weapon === 'lightning' ? 1.5 : 1)
      const mat = mesh.material as THREE.MeshBasicMaterial
      const tnorm = (now - b.start) / BEAM_MS
      mat.opacity = Math.max(0, 1 - tnorm)
      mat.color.set(b.weapon === 'lightning' ? '#facc15' : '#fb923c')
      if (b.hit) mat.color.set('#ef4444')
    })
  })
  return <group ref={groupRef} />
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
  view, me, opponent, peckFlash, hitFlash, myId, camMode, onToggleCam, onLeave, onRematch,
}: {
  view: RoomView; me?: BirdView; opponent?: BirdView
  peckFlash: number; hitFlash: number; myId: string | null
  camMode: CameraMode; onToggleCam: () => void
  onLeave: () => void; onRematch: () => void
}) {
  const iAmReady = !!myId && view.rematchReady.includes(myId)
  const oppReady = !!opponent && view.rematchReady.includes(opponent.id)
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
            Click to peck · WASD to move · Space to jump · V toggles view · Esc to free cursor
          </span>
        )}
        {view.phase === 'over' && (
          <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 44, letterSpacing: 2 }}>
              {view.winner === myId ? '🏆 YOU WIN' : view.winner ? '☠ DEFEATED' : 'DRAW'}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={(e) => { e.stopPropagation(); if (!iAmReady) onRematch() }}
                disabled={iAmReady}
                style={iAmReady ? rematchBtnReady : rematchBtn}
              >
                {iAmReady
                  ? (oppReady ? 'Resetting…' : 'Waiting for opponent…')
                  : '↻ Rematch'}
              </button>
              <button onClick={(e) => { e.stopPropagation(); onLeave() }} style={leaveBtn}>
                Leave
              </button>
            </div>
            {oppReady && !iAmReady && (
              <span style={{ fontSize: 12, opacity: 0.85, color: '#facc15' }}>
                Opponent wants a rematch
              </span>
            )}
          </div>
        )}
      </div>

      {/* Crosshair — first-person only; third-person shows the bird's own head as the aim cue */}
      {camMode === 'first' && <div style={crosshair} />}

      {/* Camera-mode chip */}
      <button onClick={onToggleCam} style={camChip}>
        {camMode === 'third' ? '3rd' : '1st'} · press V
      </button>

      {/* Room invite chip — shows the code and copies a shareable link. */}
      <RoomInviteChip />

      {/* Hint when the player is alone in the room — make it obvious how to invite. */}
      {view.phase === 'waiting' && !opponent && <WaitingForOpponentBanner />}

      {/* Weapon + buffs panel */}
      {me && view.phase !== 'over' && <LoadoutPanel me={me} />}
    </>
  )
}

function LoadoutPanel({ me }: { me: BirdView }) {
  // Force re-render at 5Hz so countdown bars tick down smoothly
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 200)
    return () => clearInterval(t)
  }, [])
  const now = Date.now()
  const weaponInfo = CLIENT_WEAPONS[me.weapon] ?? CLIENT_WEAPONS.beak
  const buffs: Array<{ key: string; label: string; emoji: string; color: string; remainingMs: number; totalMs: number }> = []
  const push = (key: string, until: number, totalMs: number) => {
    if (until <= now) return
    const info = CLIENT_ITEMS[key]
    if (!info) return
    buffs.push({ key, label: info.label, emoji: info.emoji, color: info.color, remainingMs: until - now, totalMs })
  }
  push('doubleDamage', me.dmgMulUntil, 15000)
  push('haste', me.hasteUntil, 15000)
  push('regen', me.regenUntil, 20000)
  push('immortal', me.immortalUntil, 10000)
  return (
    <div style={loadoutPanel}>
      <div style={loadoutRow}>
        <span style={{ fontSize: 20 }}>{weaponInfo.emoji}</span>
        <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, letterSpacing: 1 }}>{weaponInfo.label}</span>
        <span style={{ marginLeft: 'auto', opacity: 0.8 }}>
          {me.weaponAmmo < 0 ? '∞' : `×${me.weaponAmmo}`}
        </span>
      </div>
      {buffs.map((b) => {
        const pct = Math.max(0, Math.min(1, b.remainingMs / b.totalMs))
        return (
          <div key={b.key} style={{ ...loadoutRow, marginTop: 4 }}>
            <span>{b.emoji}</span>
            <span style={{ fontSize: 12 }}>{b.label}</span>
            <div style={buffBar}>
              <div style={{ ...buffBarFill, width: `${pct * 100}%`, background: b.color }} />
            </div>
            <span style={{ fontSize: 11, opacity: 0.75, minWidth: 28, textAlign: 'right' }}>
              {Math.ceil(b.remainingMs / 1000)}s
            </span>
          </div>
        )
      })}
    </div>
  )
}

const loadoutPanel: React.CSSProperties = {
  position: 'fixed', bottom: 60, left: 16, zIndex: 45,
  background: 'rgba(12,12,12,0.85)', color: '#f5f1e8',
  border: '2px solid rgba(255,255,255,0.15)', padding: '8px 12px',
  minWidth: 220, fontFamily: '"JetBrains Mono", monospace',
}
const loadoutRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
}
const buffBar: React.CSSProperties = {
  flex: 1, height: 6, background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.2)',
}
const buffBarFill: React.CSSProperties = {
  height: '100%', transition: 'width 0.18s',
}

const rematchBtn: React.CSSProperties = {
  background: '#dc2626', color: '#f5f1e8',
  border: '3px solid #0c0c0c', boxShadow: '4px 4px 0 #0c0c0c',
  fontFamily: 'Anton, sans-serif', letterSpacing: 1, fontSize: 22,
  padding: '12px 22px', cursor: 'pointer', textTransform: 'uppercase',
}
const rematchBtnReady: React.CSSProperties = {
  ...{
    background: '#52525b', color: '#a3a3a3',
    border: '3px solid #27272a', boxShadow: 'none',
    fontFamily: 'Anton, sans-serif', letterSpacing: 1, fontSize: 18,
    padding: '12px 22px', cursor: 'default', textTransform: 'uppercase',
  },
}
const leaveBtn: React.CSSProperties = {
  background: 'transparent', color: '#f5f1e8',
  border: '2px solid #f5f1e8', padding: '12px 18px',
  fontFamily: '"JetBrains Mono", monospace', fontSize: 13, letterSpacing: 1,
  cursor: 'pointer',
}

function RoomInviteChip() {
  const code = useMultiplayer((s) => s.code)
  const mode = useMultiplayer((s) => s.mode)
  const [copied, setCopied] = useState(false)
  if (!code) return null
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${code}&mode=${mode}`
  const onCopy = async () => {
    // On mobile, prefer the native share sheet so users can send via Messages/WhatsApp/etc.
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: 'Join my Sabong room', text: `Join room ${code}`, url: inviteUrl })
        return
      } catch { /* user cancelled — fall through to clipboard */ }
    }
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { }
  }
  return (
    <div style={inviteChip}>
      <span style={{ opacity: 0.7, fontSize: 10, letterSpacing: 1 }}>ROOM</span>
      <code style={{ fontSize: 14, letterSpacing: 2, color: '#facc15' }}>{code}</code>
      <button onClick={onCopy} style={inviteBtn}>
        {copied ? '✓ Copied' : '📋 Invite link'}
      </button>
    </div>
  )
}

function WaitingForOpponentBanner() {
  const code = useMultiplayer((s) => s.code)
  return (
    <div style={waitingBanner}>
      <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 28, letterSpacing: 2 }}>
        WAITING FOR OPPONENT…
      </div>
      <div style={{ marginTop: 6, opacity: 0.8 }}>
        Share room code <b style={{ color: '#facc15' }}>{code}</b> or use the invite link in the top-right.
      </div>
    </div>
  )
}

const inviteChip: React.CSSProperties = {
  position: 'fixed', top: 60, right: 16, zIndex: 45,
  background: 'rgba(12,12,12,0.85)', color: '#fef3c7',
  border: '2px solid rgba(255,255,255,0.15)',
  padding: '6px 10px',
  display: 'flex', alignItems: 'center', gap: 8,
  fontFamily: '"JetBrains Mono", monospace',
}
const inviteBtn: React.CSSProperties = {
  background: '#facc15', color: '#0c0c0c',
  border: 'none', padding: '4px 8px',
  fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', letterSpacing: 1,
}
const waitingBanner: React.CSSProperties = {
  position: 'fixed', top: '38%', left: 0, right: 0, zIndex: 45,
  textAlign: 'center', color: '#f5f1e8',
  fontFamily: '"JetBrains Mono", monospace', pointerEvents: 'none',
}

const camChip: React.CSSProperties = {
  position: 'fixed', top: 16, right: 16, zIndex: 45,
  background: 'rgba(12,12,12,0.85)', color: '#fef3c7',
  border: '2px solid #facc15', padding: '6px 12px',
  fontFamily: '"JetBrains Mono", monospace', fontSize: 12, letterSpacing: 1,
  cursor: 'pointer',
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
