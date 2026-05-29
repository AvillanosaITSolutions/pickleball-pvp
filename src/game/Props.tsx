import { useMemo, useRef, useState, useEffect } from 'react'
import { RigidBody, CuboidCollider, CylinderCollider, BallCollider } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import { ROOM } from './constants'
import { triggerImpact } from './effects'
import { ErrorBoundary } from './ErrorBoundary'

/**
 * Registry of breakable rigid bodies by their rapier handle.
 * The gun raycast (Player.fireGun) consults this to shatter glass props.
 */
export const breakRegistry = new Map<number, () => void>()

/**
 * Ambient breakable / knockable physics props scattered around the room.
 * Glass items (bottles, wine glasses, plates, bulbs, vases, picture frames)
 * shatter into shards on hard impact.
 */
export function Props() {
  const layout = useMemo(() => generateLayout(), [])

  return (
    <group>
      {/* Two side shelves */}
      <Shelf x={-ROOM.width / 2 + 0.25} z={-2} y={1.0} length={6} />
      <Shelf x={-ROOM.width / 2 + 0.25} z={3.5} y={1.7} length={4} />
      <Shelf x={ROOM.width / 2 - 0.25} z={2} y={1.0} length={6} />
      <Shelf x={ROOM.width / 2 - 0.25} z={-3.5} y={1.7} length={4} />
      {/* A long table in the middle-back of the room */}
      <Table x={0} z={-ROOM.depth / 4} length={3.5} width={1.2} height={0.85} />
      {/* Side end-table */}
      <Table x={-4} z={1} length={1.4} width={1.0} height={0.7} />

      {layout.map((p, i) => (
        <ErrorBoundary key={i} label={`prop:${p.kind}`}>
          <PropFor spec={p} />
        </ErrorBoundary>
      ))}
    </group>
  )
}

// --- Prop kinds ---------------------------------------------------------

type PropKind =
  | 'bottle' | 'mug' | 'box' | 'book' | 'can' | 'stool' | 'monitor' | 'keyboard'
  | 'wineGlass' | 'plate' | 'vase' | 'lightBulb' | 'pictureFrame' | 'fishBowl' | 'lamp' | 'beerBottle'

interface PropSpec {
  kind: PropKind
  pos: [number, number, number]
  rotY: number
}

function PropFor({ spec }: { spec: PropSpec }) {
  const { kind, pos, rotY } = spec
  switch (kind) {
    // Glass — breakable
    case 'bottle':       return <Bottle pos={pos} rotY={rotY} />
    case 'beerBottle':   return <BeerBottle pos={pos} rotY={rotY} />
    case 'wineGlass':    return <WineGlass pos={pos} rotY={rotY} />
    case 'plate':        return <Plate pos={pos} rotY={rotY} />
    case 'vase':         return <Vase pos={pos} rotY={rotY} />
    case 'lightBulb':    return <LightBulb pos={pos} rotY={rotY} />
    case 'fishBowl':     return <FishBowl pos={pos} rotY={rotY} />
    case 'pictureFrame': return <PictureFrame pos={pos} rotY={rotY} />
    case 'lamp':         return <Lamp pos={pos} rotY={rotY} />
    // Non-glass — just physics, no shatter
    case 'mug':          return <Mug pos={pos} rotY={rotY} />
    case 'box':          return <Box pos={pos} rotY={rotY} />
    case 'book':         return <Book pos={pos} rotY={rotY} />
    case 'can':          return <Can pos={pos} rotY={rotY} />
    case 'stool':        return <Stool pos={pos} rotY={rotY} />
    case 'monitor':      return <Monitor pos={pos} rotY={rotY} />
    case 'keyboard':     return <Keyboard pos={pos} rotY={rotY} />
  }
}

// --- Layout generation --------------------------------------------------

function generateLayout(): PropSpec[] {
  const out: PropSpec[] = []
  const r = mulberry32(1337)

  // Left shelf row (lower) — wine glasses + bottles
  const sxL = -ROOM.width / 2 + 0.5
  for (let i = 0; i < 6; i++) {
    out.push({
      kind: i % 2 ? 'wineGlass' : 'bottle',
      pos: [sxL, 1.13, -4.5 + i * 0.9],
      rotY: r() * Math.PI * 2,
    })
  }
  // Left shelf upper — plates + vase + frame
  for (let i = 0; i < 4; i++) {
    const k: PropKind = i === 1 ? 'vase' : i === 3 ? 'pictureFrame' : 'plate'
    out.push({
      kind: k,
      pos: [sxL, 1.83, 1.8 + i * 0.9],
      rotY: r() * Math.PI * 2,
    })
  }
  // Right shelf row — beer bottles + mugs
  const sxR = ROOM.width / 2 - 0.5
  for (let i = 0; i < 6; i++) {
    out.push({
      kind: i % 2 ? 'beerBottle' : 'mug',
      pos: [sxR, 1.13, -2.5 + i * 0.9],
      rotY: r() * Math.PI * 2,
    })
  }
  // Right shelf upper — bulbs + frames + fishbowl
  out.push({ kind: 'fishBowl',     pos: [sxR, 1.83, -4.6], rotY: 0 })
  out.push({ kind: 'pictureFrame', pos: [sxR, 1.83, -3.5], rotY: 0 })
  out.push({ kind: 'lightBulb',    pos: [sxR, 1.83, -2.6], rotY: 0 })
  out.push({ kind: 'lightBulb',    pos: [sxR, 1.83, -2.1], rotY: 0 })
  out.push({ kind: 'plate',        pos: [sxR, 1.83, -1.4], rotY: 0 })

  // Main table items
  const tableY = 0.95
  const tableZ = -ROOM.depth / 4
  out.push({ kind: 'monitor',  pos: [-0.6, tableY + 0.25, tableZ - 0.05], rotY: 0.1 })
  out.push({ kind: 'monitor',  pos: [0.9,  tableY + 0.25, tableZ - 0.1],  rotY: -0.15 })
  out.push({ kind: 'keyboard', pos: [-0.4, tableY,        tableZ + 0.35], rotY: 0 })
  out.push({ kind: 'keyboard', pos: [1.0,  tableY,        tableZ + 0.35], rotY: 0.05 })
  out.push({ kind: 'mug',      pos: [0.3,  tableY + 0.05, tableZ + 0.4],  rotY: 0 })
  out.push({ kind: 'can',      pos: [-1.1, tableY + 0.05, tableZ + 0.4],  rotY: 0 })
  out.push({ kind: 'book',     pos: [-1.3, tableY + 0.04, tableZ - 0.2],  rotY: 0.2 })
  out.push({ kind: 'book',     pos: [1.4,  tableY + 0.04, tableZ - 0.25], rotY: -0.3 })
  out.push({ kind: 'lamp',     pos: [-1.55, tableY + 0.18, tableZ - 0.4], rotY: 0 })
  out.push({ kind: 'wineGlass',pos: [-0.95, tableY + 0.08, tableZ + 0.05], rotY: 0 })
  out.push({ kind: 'wineGlass',pos: [1.4,  tableY + 0.08, tableZ + 0.1],  rotY: 0.3 })
  out.push({ kind: 'plate',    pos: [0.0,  tableY + 0.03, tableZ - 0.4],  rotY: 0 })
  out.push({ kind: 'plate',    pos: [-0.05,tableY + 0.05, tableZ - 0.4],  rotY: 0.1 })

  // End table (side)
  out.push({ kind: 'lamp', pos: [-4, 0.78, 1], rotY: 0 })
  out.push({ kind: 'pictureFrame', pos: [-3.6, 0.82, 1.4], rotY: -0.6 })
  out.push({ kind: 'vase', pos: [-4.3, 0.82, 0.7], rotY: 0 })
  out.push({ kind: 'beerBottle', pos: [-3.7, 0.78, 0.8], rotY: 0.4 })

  // Floor scatter
  const floor: Array<[number, number, number, PropKind]> = [
    [-ROOM.width / 2 + 1.2, 0.3,  -ROOM.depth / 2 + 1.5, 'box'],
    [-ROOM.width / 2 + 1.8, 0.6,  -ROOM.depth / 2 + 1.5, 'box'],
    [-ROOM.width / 2 + 1.0, 0.3,  -ROOM.depth / 2 + 2.8, 'box'],
    [-ROOM.width / 2 + 2.5, 0.4,  -ROOM.depth / 2 + 1.2, 'stool'],
    [ROOM.width / 2 - 1.5,  0.3,  -ROOM.depth / 2 + 1.5, 'box'],
    [ROOM.width / 2 - 2.0,  0.4,  -ROOM.depth / 2 + 2.7, 'stool'],
    [ROOM.width / 2 - 1.2,  0.06, -ROOM.depth / 2 + 0.6, 'can'],
    [-2, 0.06, -2,    'book'],
    [3,  0.06, -5,    'book'],
    [-3.5, 0.06, -4.5,'can'],
    [2.5,  0.06, 0.5, 'bottle'],
    [-1.5, 0.06, 1.8, 'bottle'],
    [4,    0.4,  -3,  'stool'],
    [-4.5, 0.4,  4,   'stool'],
    [5.5,  0.06, 2,   'beerBottle'],
    [-6,   0.06, -3,  'beerBottle'],
    [6,    0.06, -1,  'plate'],
    [-5.5, 0.06, 2.5, 'wineGlass'],
    [5,    0.06, 5,   'lightBulb'],
  ]
  for (const [px, py, pz, kind] of floor) {
    out.push({ kind, pos: [px, py, pz], rotY: r() * Math.PI * 2 })
  }
  return out
}

function mulberry32(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- Furniture (fixed, doesn't move) ------------------------------------

function Shelf({ x, z, y, length }: { x: number; z: number; y: number; length: number }) {
  const sign = x > 0 ? -1 : 1
  return (
    <RigidBody type="fixed" friction={0.6}>
      <mesh position={[x + sign * 0.18, y, z]} castShadow receiveShadow>
        <boxGeometry args={[0.36, 0.04, length]} />
        <meshStandardMaterial color="#52525b" roughness={0.7} />
      </mesh>
      {[-length / 2 + 0.3, length / 2 - 0.3].map((bz, i) => (
        <mesh
          key={i}
          position={[x + sign * 0.05, y - 0.18, z + bz]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <boxGeometry args={[0.36, 0.03, 0.03]} />
          <meshStandardMaterial color="#3f3f46" />
        </mesh>
      ))}
    </RigidBody>
  )
}

function Table({
  x, z, length, width, height,
}: { x: number; z: number; length: number; width: number; height: number }) {
  return (
    <RigidBody type="fixed" friction={0.7}>
      <mesh position={[x, height, z]} castShadow receiveShadow>
        <boxGeometry args={[length, 0.06, width]} />
        <meshStandardMaterial color="#78350f" roughness={0.6} />
      </mesh>
      {[
        [length / 2 - 0.06, width / 2 - 0.06],
        [-length / 2 + 0.06, width / 2 - 0.06],
        [length / 2 - 0.06, -width / 2 + 0.06],
        [-length / 2 + 0.06, -width / 2 + 0.06],
      ].map((p, i) => (
        <mesh key={i} position={[x + p[0], height / 2, z + p[1]]} castShadow>
          <boxGeometry args={[0.08, height, 0.08]} />
          <meshStandardMaterial color="#451a03" />
        </mesh>
      ))}
    </RigidBody>
  )
}

// --- Breakable wrapper --------------------------------------------------

interface BreakableProps {
  pos: [number, number, number]
  rotY: number
  mass: number
  threshold?: number          // impact speed at which it shatters
  shardColor: string
  shardOpacity?: number
  shardCount?: number
  collider: React.ReactNode    // pre-made collider element
  children: React.ReactNode    // the visible mesh
}

function Breakable({
  pos, rotY, mass, threshold = 5,
  shardColor, shardOpacity = 0.9, shardCount = 6,
  collider, children,
}: BreakableProps) {
  const ref = useRef<RapierRigidBody>(null)
  const [broken, setBroken] = useState(false)
  const breakPosRef = useRef<[number, number, number]>(pos)

  // Trigger a break externally (used by gun raycast). Captures the body's
  // current position before flipping state so shards spawn where the object is.
  const breakNow = () => {
    if (broken) return
    const p = ref.current?.translation()
    if (p) breakPosRef.current = [p.x, p.y, p.z]
    triggerImpact(0.35)
    playGlass()
    setBroken(true)
  }

  // Register/unregister this breakable so the gun raycast can find it.
  useEffect(() => {
    const handle = ref.current?.handle
    if (handle === undefined) return
    breakRegistry.set(handle, breakNow)
    return () => {
      breakRegistry.delete(handle)
    }
  })

  if (broken) {
    return (
      <Shards
        origin={breakPosRef.current}
        color={shardColor}
        opacity={shardOpacity}
        count={shardCount}
      />
    )
  }

  return (
    <RigidBody
      ref={ref}
      position={pos}
      rotation={[0, rotY, 0]}
      mass={mass}
      colliders={false}
      friction={0.4}
      restitution={0.05}
      onCollisionEnter={(e) => {
        if (broken) return
        // Use the OTHER body's speed as impact metric — accurate even
        // when this prop hasn't started moving yet.
        const ov = e.other?.rigidBody?.linvel?.()
        const sv = ref.current?.linvel?.()
        const oSpeed = ov ? Math.hypot(ov.x, ov.y, ov.z) : 0
        const sSpeed = sv ? Math.hypot(sv.x, sv.y, sv.z) : 0
        const impact = Math.max(oSpeed, sSpeed)
        if (impact >= threshold) {
          const p = ref.current?.translation()
          if (p) breakPosRef.current = [p.x, p.y, p.z]
          triggerImpact(0.35)
          playGlass()
          setBroken(true)
        }
      }}
    >
      {collider}
      {children}
    </RigidBody>
  )
}

// Audio: lightweight Audio API. Pool of 3 to avoid restart cutoff.
// Real glass-break sample — distinct from thud so smashes have their own character.
const glassPool: HTMLAudioElement[] = []
let glassCursor = 0
function getGlassPool() {
  if (glassPool.length === 0) {
    for (let i = 0; i < 3; i++) {
      const a = new Audio('/audio/glass-break.mp3')
      a.preload = 'auto'
      a.volume = 0.7
      glassPool.push(a)
    }
  }
  return glassPool
}
function playGlass() {
  const pool = getGlassPool()
  const a = pool[glassCursor]
  glassCursor = (glassCursor + 1) % pool.length
  try {
    a.currentTime = 0
    a.play().catch(() => {})
  } catch {}
}

// Shards: a handful of small cuboid rigid bodies spawned with random
// outward velocities. Fade and auto-despawn after a few seconds.
function Shards({
  origin, color, opacity, count,
}: { origin: [number, number, number]; color: string; opacity: number; count: number }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4500)
    return () => clearTimeout(t)
  }, [])
  if (!visible) return null

  const seeds = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      ox: (Math.random() - 0.5) * 0.05,
      oy: (Math.random() - 0.5) * 0.05,
      oz: (Math.random() - 0.5) * 0.05,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 2,
      vz: (Math.random() - 0.5) * 3,
      size: 0.025 + Math.random() * 0.03,
      idx: i,
    }))
  }, [count])

  return (
    <>
      {seeds.map((s) => (
        <Shard
          key={s.idx}
          position={[origin[0] + s.ox, origin[1] + s.oy, origin[2] + s.oz]}
          velocity={[s.vx, s.vy, s.vz]}
          size={s.size}
          color={color}
          opacity={opacity}
        />
      ))}
    </>
  )
}

function Shard({
  position, velocity, size, color, opacity,
}: {
  position: [number, number, number]
  velocity: [number, number, number]
  size: number
  color: string
  opacity: number
}) {
  const ref = useRef<RapierRigidBody>(null)
  useEffect(() => {
    ref.current?.setLinvel({ x: velocity[0], y: velocity[1], z: velocity[2] }, true)
    ref.current?.setAngvel(
      { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 },
      true,
    )
  }, [])
  return (
    <RigidBody
      ref={ref}
      position={position}
      mass={0.02}
      colliders="cuboid"
      restitution={0.15}
      friction={0.5}
    >
      <mesh castShadow>
        <boxGeometry args={[size, size * 0.4, size * 0.7]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.15} />
      </mesh>
    </RigidBody>
  )
}

// --- Non-glass props ----------------------------------------------------

function Mug({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <RigidBody position={pos} rotation={[0, rotY, 0]} colliders={false} mass={0.25} restitution={0.3}>
      <CylinderCollider args={[0.05, 0.05]} />
      <mesh castShadow>
        <cylinderGeometry args={[0.05, 0.045, 0.1, 14]} />
        <meshStandardMaterial color="#fff7ed" roughness={0.4} />
      </mesh>
      <mesh position={[0.07, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.03, 0.012, 6, 14, Math.PI]} />
        <meshStandardMaterial color="#fff7ed" />
      </mesh>
    </RigidBody>
  )
}

function Box({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  const w = 0.35 + ((pos[0] + pos[2]) % 0.15) * 0.6
  const h = 0.3 + ((pos[0] - pos[2]) % 0.1) * 0.5
  return (
    <RigidBody position={pos} rotation={[0, rotY, 0]} colliders="cuboid" mass={0.8} restitution={0.2}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, w]} />
        <meshStandardMaterial color="#a16207" roughness={0.95} />
      </mesh>
    </RigidBody>
  )
}

function Book({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  const colors = ['#dc2626', '#2563eb', '#16a34a', '#7c3aed', '#f59e0b']
  const color = colors[Math.floor(Math.abs(pos[0] * 7 + pos[2] * 13)) % colors.length]
  return (
    <RigidBody position={pos} rotation={[0, rotY, 0]} colliders="cuboid" mass={0.4} restitution={0.1}>
      <mesh castShadow>
        <boxGeometry args={[0.22, 0.05, 0.16]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </RigidBody>
  )
}

function Can({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  const colors = ['#ef4444', '#3b82f6', '#22c55e']
  const color = colors[Math.floor(Math.abs(pos[0] * 11 + pos[2] * 5)) % colors.length]
  return (
    <RigidBody position={pos} rotation={[0, rotY, 0]} colliders={false} mass={0.15} restitution={0.5}>
      <CylinderCollider args={[0.06, 0.04]} />
      <mesh castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.12, 14]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
      </mesh>
    </RigidBody>
  )
}

function Stool({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <RigidBody position={pos} rotation={[0, rotY, 0]} colliders={false} mass={2.5} restitution={0.2}>
      <CuboidCollider args={[0.18, 0.22, 0.18]} />
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.06, 16]} />
        <meshStandardMaterial color="#1c1917" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 0.36, 8]} />
        <meshStandardMaterial color="#374151" metalness={0.4} />
      </mesh>
      <mesh position={[0, -0.18, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.03, 16]} />
        <meshStandardMaterial color="#27272a" metalness={0.4} />
      </mesh>
    </RigidBody>
  )
}

function Monitor({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <RigidBody position={pos} rotation={[0, rotY, 0]} colliders="cuboid" mass={1.5} restitution={0.15}>
      <mesh castShadow>
        <boxGeometry args={[0.6, 0.36, 0.05]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.026]}>
        <planeGeometry args={[0.55, 0.32]} />
        <meshBasicMaterial color="#1e3a8a" />
      </mesh>
      <mesh position={[0, -0.22, 0]}>
        <boxGeometry args={[0.04, 0.1, 0.04]} />
        <meshStandardMaterial color="#27272a" />
      </mesh>
      <mesh position={[0, -0.27, 0]}>
        <boxGeometry args={[0.2, 0.02, 0.12]} />
        <meshStandardMaterial color="#27272a" />
      </mesh>
    </RigidBody>
  )
}

function Keyboard({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <RigidBody position={pos} rotation={[0, rotY, 0]} colliders="cuboid" mass={0.5} restitution={0.2}>
      <mesh castShadow>
        <boxGeometry args={[0.45, 0.03, 0.16]} />
        <meshStandardMaterial color="#27272a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.42, 0.005, 0.13]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
    </RigidBody>
  )
}

// --- Breakable glass items ---------------------------------------------

function Bottle({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <Breakable
      pos={pos} rotY={rotY} mass={0.3} threshold={4.5}
      shardColor="#16a34a" shardOpacity={0.7} shardCount={6}
      collider={<CylinderCollider args={[0.13, 0.05]} />}
    >
      <mesh castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.22, 12]} />
        <meshStandardMaterial color="#16a34a" transparent opacity={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.16, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.04, 0.08, 8]} />
        <meshStandardMaterial color="#15803d" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.027, 0.027, 0.025, 8]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>
    </Breakable>
  )
}

function BeerBottle({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <Breakable
      pos={pos} rotY={rotY} mass={0.35} threshold={4.5}
      shardColor="#854d0e" shardOpacity={0.65} shardCount={6}
      collider={<CylinderCollider args={[0.14, 0.04]} />}
    >
      <mesh castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.24, 12]} />
        <meshStandardMaterial color="#854d0e" transparent opacity={0.6} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.035, 0.06, 8]} />
        <meshStandardMaterial color="#713f12" />
      </mesh>
      {/* label */}
      <mesh position={[0, 0.02, 0.041]}>
        <planeGeometry args={[0.06, 0.08]} />
        <meshBasicMaterial color="#fef3c7" />
      </mesh>
    </Breakable>
  )
}

function WineGlass({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <Breakable
      pos={pos} rotY={rotY} mass={0.15} threshold={3.5}
      shardColor="#fef9c3" shardOpacity={0.45} shardCount={7}
      collider={<CylinderCollider args={[0.11, 0.05]} />}
    >
      {/* bowl */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <sphereGeometry args={[0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2]} />
        <meshStandardMaterial color="#e0f2fe" transparent opacity={0.45} roughness={0.1} />
      </mesh>
      {/* stem */}
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.005, 0.005, 0.12, 6]} />
        <meshStandardMaterial color="#e0f2fe" transparent opacity={0.55} roughness={0.1} />
      </mesh>
      {/* base */}
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.008, 12]} />
        <meshStandardMaterial color="#e0f2fe" transparent opacity={0.6} roughness={0.1} />
      </mesh>
    </Breakable>
  )
}

function Plate({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <Breakable
      pos={pos} rotY={rotY} mass={0.3} threshold={3.8}
      shardColor="#f1f5f9" shardOpacity={0.95} shardCount={7}
      collider={<CylinderCollider args={[0.012, 0.12]} />}
    >
      <mesh castShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.018, 24]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.3} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.085, 0.085, 0.004, 20]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.4} />
      </mesh>
    </Breakable>
  )
}

function Vase({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <Breakable
      pos={pos} rotY={rotY} mass={0.6} threshold={4}
      shardColor="#9333ea" shardOpacity={0.85} shardCount={8}
      collider={<CylinderCollider args={[0.18, 0.09]} />}
    >
      <mesh castShadow>
        <cylinderGeometry args={[0.06, 0.09, 0.34, 16]} />
        <meshStandardMaterial color="#9333ea" roughness={0.3} metalness={0.2} />
      </mesh>
      {/* lip */}
      <mesh position={[0, 0.17, 0]} castShadow>
        <torusGeometry args={[0.06, 0.012, 6, 16]} />
        <meshStandardMaterial color="#7e22ce" />
      </mesh>
    </Breakable>
  )
}

function LightBulb({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <Breakable
      pos={pos} rotY={rotY} mass={0.1} threshold={3}
      shardColor="#fef3c7" shardOpacity={0.5} shardCount={6}
      collider={<BallCollider args={[0.045]} />}
    >
      <mesh castShadow>
        <sphereGeometry args={[0.045, 14, 14]} />
        <meshStandardMaterial color="#fef9c3" transparent opacity={0.7} roughness={0.1} emissive="#fef3c7" emissiveIntensity={0.4} />
      </mesh>
      {/* socket */}
      <mesh position={[0, -0.055, 0]}>
        <cylinderGeometry args={[0.022, 0.025, 0.025, 8]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.7} />
      </mesh>
    </Breakable>
  )
}

function FishBowl({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <Breakable
      pos={pos} rotY={rotY} mass={0.5} threshold={4}
      shardColor="#bfdbfe" shardOpacity={0.4} shardCount={9}
      collider={<BallCollider args={[0.13]} />}
    >
      <mesh castShadow>
        <sphereGeometry args={[0.13, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.85]} />
        <meshStandardMaterial color="#bfdbfe" transparent opacity={0.4} roughness={0.1} />
      </mesh>
      {/* water inside */}
      <mesh position={[0, -0.02, 0]}>
        <sphereGeometry args={[0.11, 14, 12]} />
        <meshStandardMaterial color="#3b82f6" transparent opacity={0.55} roughness={0.2} />
      </mesh>
    </Breakable>
  )
}

function PictureFrame({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <Breakable
      pos={pos} rotY={rotY} mass={0.4} threshold={4}
      shardColor="#fbbf24" shardOpacity={0.9} shardCount={5}
      collider={<CuboidCollider args={[0.12, 0.16, 0.02]} />}
    >
      {/* frame */}
      <mesh castShadow>
        <boxGeometry args={[0.24, 0.32, 0.025]} />
        <meshStandardMaterial color="#a16207" roughness={0.6} />
      </mesh>
      {/* glass */}
      <mesh position={[0, 0, 0.014]}>
        <planeGeometry args={[0.2, 0.28]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.35} roughness={0.1} />
      </mesh>
      {/* "photo" backing */}
      <mesh position={[0, 0, -0.014]}>
        <planeGeometry args={[0.2, 0.28]} />
        <meshBasicMaterial color="#475569" />
      </mesh>
    </Breakable>
  )
}

function Lamp({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <Breakable
      pos={pos} rotY={rotY} mass={0.7} threshold={4.5}
      shardColor="#fef3c7" shardOpacity={0.7} shardCount={6}
      collider={<CylinderCollider args={[0.16, 0.1]} />}
    >
      {/* base */}
      <mesh castShadow>
        <cylinderGeometry args={[0.1, 0.12, 0.04, 16]} />
        <meshStandardMaterial color="#1c1917" />
      </mesh>
      {/* stem */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.18, 8]} />
        <meshStandardMaterial color="#27272a" metalness={0.5} />
      </mesh>
      {/* shade */}
      <mesh position={[0, 0.24, 0]} castShadow>
        <coneGeometry args={[0.1, 0.14, 16, 1, true]} />
        <meshStandardMaterial color="#fef3c7" side={2} emissive="#fef3c7" emissiveIntensity={0.3} />
      </mesh>
    </Breakable>
  )
}
