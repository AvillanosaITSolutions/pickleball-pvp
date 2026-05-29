import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ProjectileKind } from './store'
import { KIND_INFO } from './store'
import { PROJECTILE } from './constants'
import { fireFlash } from './dummyState'

interface Props {
  kind: ProjectileKind
}

export function ProjectileShape({ kind }: Props) {
  switch (kind) {
    case 'chair':
      return <ChairShape />
    case 'egg':
      return <EggShape />
    case 'rock':
      return <RockShape />
    case 'water':
      return <WaterGlassShape />
    case 'tv':
      return <TVShape />
    case 'gun':
      return <GunShape />
    case 'shit':
      return <ShitShape />
    case 'brick':
      return <BrickShape />
    case 'cake':
      return <CakeShape />
    case 'banana':
      return <BananaShape />
    case 'bowlingBall':
      return <BowlingBallShape />
    case 'paint':
    case 'tomato':
    default:
      return <BallShape kind={kind} />
  }
}

function BallShape({ kind }: { kind: ProjectileKind }) {
  const info = KIND_INFO[kind]
  return (
    <mesh castShadow>
      <sphereGeometry args={[PROJECTILE.radius, 16, 16]} />
      <meshStandardMaterial color={info.color} roughness={0.8} />
    </mesh>
  )
}

function EggShape() {
  const info = KIND_INFO.egg
  return (
    <mesh castShadow scale={[1, 1.25, 1]}>
      <sphereGeometry args={[PROJECTILE.radius, 16, 16]} />
      <meshStandardMaterial color={info.color} roughness={0.4} />
    </mesh>
  )
}

function RockShape() {
  const info = KIND_INFO.rock
  return (
    <mesh castShadow>
      <dodecahedronGeometry args={[PROJECTILE.radius * 1.1, 0]} />
      <meshStandardMaterial color={info.color} roughness={0.95} metalness={0.2} />
    </mesh>
  )
}

function ChairShape() {
  // Simple wooden chair: seat, back, four legs
  const wood = '#92400e'
  const woodDark = '#78350f'
  return (
    <group>
      {/* Seat */}
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[0.5, 0.06, 0.5]} />
        <meshStandardMaterial color={wood} roughness={0.8} />
      </mesh>
      {/* Backrest */}
      <mesh castShadow position={[0, 0.32, -0.22]}>
        <boxGeometry args={[0.5, 0.6, 0.05]} />
        <meshStandardMaterial color={woodDark} roughness={0.8} />
      </mesh>
      {/* Legs */}
      {[
        [0.21, -0.25, 0.21],
        [-0.21, -0.25, 0.21],
        [0.21, -0.25, -0.21],
        [-0.21, -0.25, -0.21],
      ].map((p, i) => (
        <mesh key={i} castShadow position={p as [number, number, number]}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
          <meshStandardMaterial color={woodDark} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function WaterGlassShape() {
  return (
    <group>
      {/* Glass cylinder */}
      <mesh castShadow>
        <cylinderGeometry args={[0.13, 0.11, 0.32, 24, 1, true]} />
        <meshStandardMaterial
          color="#e0f2fe"
          transparent
          opacity={0.4}
          roughness={0.1}
          side={2}
        />
      </mesh>
      {/* Water inside */}
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[0.115, 0.1, 0.22, 20]} />
        <meshStandardMaterial
          color="#3b82f6"
          transparent
          opacity={0.75}
          roughness={0.2}
        />
      </mesh>
      {/* Top rim */}
      <mesh position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.13, 0.012, 6, 24]} />
        <meshStandardMaterial color="#cbd5e1" transparent opacity={0.6} />
      </mesh>
      {/* Bottom */}
      <mesh position={[0, -0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.11, 20]} />
        <meshStandardMaterial color="#94a3b8" transparent opacity={0.5} />
      </mesh>
    </group>
  )
}

function TVShape() {
  const screenRef = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((state) => {
    if (screenRef.current) {
      const t = state.clock.elapsedTime
      // Static-ish color jitter
      const c = 0.4 + (Math.sin(t * 30) + Math.sin(t * 47)) * 0.15
      screenRef.current.color.setRGB(c, c * 0.9, c * 1.1)
    }
  })
  return (
    <group>
      {/* Body */}
      <mesh castShadow>
        <boxGeometry args={[0.7, 0.45, 0.12]} />
        <meshStandardMaterial color="#1c1917" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Bezel */}
      <mesh position={[0, 0, 0.061]}>
        <boxGeometry args={[0.66, 0.41, 0.005]} />
        <meshStandardMaterial color="#0a0a0a" />
      </mesh>
      {/* Screen — emissive flickering */}
      <mesh position={[0, 0, 0.065]}>
        <planeGeometry args={[0.6, 0.36]} />
        <meshBasicMaterial ref={screenRef} color="#9ca3af" />
      </mesh>
      {/* Stand */}
      <mesh position={[0, -0.27, 0]} castShadow>
        <boxGeometry args={[0.18, 0.04, 0.1]} />
        <meshStandardMaterial color="#27272a" />
      </mesh>
      <mesh position={[0, -0.22, 0]}>
        <boxGeometry args={[0.05, 0.06, 0.04]} />
        <meshStandardMaterial color="#27272a" />
      </mesh>
    </group>
  )
}

function GunShape() {
  const flashRef = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  useFrame(() => {
    const visible = performance.now() < fireFlash.until
    if (flashRef.current) {
      flashRef.current.visible = visible
      if (visible) {
        const s = 0.9 + Math.random() * 0.6
        flashRef.current.scale.set(s, s, s)
        flashRef.current.rotation.z = Math.random() * Math.PI
      }
    }
    if (lightRef.current) {
      lightRef.current.intensity = visible ? 4 : 0
    }
  })
  return (
    <group>
      {/* Slide / body */}
      <mesh castShadow position={[0, 0.005, -0.08]}>
        <boxGeometry args={[0.05, 0.07, 0.22]} />
        <meshStandardMaterial color="#27272a" roughness={0.4} metalness={0.7} />
      </mesh>
      {/* Lower frame */}
      <mesh position={[0, -0.04, -0.06]}>
        <boxGeometry args={[0.045, 0.04, 0.16]} />
        <meshStandardMaterial color="#1c1917" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* Grip */}
      <mesh castShadow position={[0, -0.13, 0.02]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[0.045, 0.16, 0.07]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
      </mesh>
      {/* Barrel tip ring */}
      <mesh
        castShadow
        position={[0, 0.005, -0.2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.017, 0.017, 0.04, 14]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Front sight */}
      <mesh position={[0, 0.045, -0.16]}>
        <boxGeometry args={[0.012, 0.014, 0.02]} />
        <meshStandardMaterial color="#52525b" />
      </mesh>
      {/* Rear sight */}
      <mesh position={[0, 0.045, 0.01]}>
        <boxGeometry args={[0.04, 0.012, 0.012]} />
        <meshStandardMaterial color="#52525b" />
      </mesh>
      {/* Trigger guard */}
      <mesh position={[0, -0.05, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.025, 0.005, 6, 18, Math.PI]} />
        <meshStandardMaterial color="#27272a" />
      </mesh>
      {/* Muzzle flash (hidden until fired) */}
      <mesh
        ref={flashRef}
        position={[0, 0.005, -0.235]}
        rotation={[Math.PI / 2, 0, 0]}
        visible={false}
      >
        <coneGeometry args={[0.07, 0.18, 8]} />
        <meshBasicMaterial color="#fef3c7" transparent opacity={0.85} />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, 0.02, -0.25]}
        color="#fef3c7"
        intensity={0}
        distance={3}
      />
    </group>
  )
}

function ShitShape() {
  return (
    <group>
      {/* Stacked swirl */}
      <mesh castShadow>
        <sphereGeometry args={[0.13, 16, 12]} />
        <meshStandardMaterial color="#3f2812" roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0.015, 0.09, 0]} scale={[1, 0.9, 1]}>
        <sphereGeometry args={[0.1, 14, 12]} />
        <meshStandardMaterial color="#4a2f15" roughness={0.95} />
      </mesh>
      <mesh castShadow position={[-0.012, 0.16, 0.012]} scale={[1, 0.9, 1]}>
        <sphereGeometry args={[0.075, 12, 10]} />
        <meshStandardMaterial color="#5c3a1c" roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, 0.22, 0]}>
        <coneGeometry args={[0.04, 0.07, 8]} />
        <meshStandardMaterial color="#5c3a1c" roughness={0.95} />
      </mesh>
      {/* Emoji-style eyes */}
      {[
        [-0.05, 0.06, 0.1],
        [0.05, 0.06, 0.1],
      ].map((p, i) => (
        <group key={i} position={p as [number, number, number]}>
          <mesh>
            <sphereGeometry args={[0.022, 10, 10]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0, 0, 0.018]}>
            <sphereGeometry args={[0.009, 8, 8]} />
            <meshBasicMaterial color="#000000" />
          </mesh>
        </group>
      ))}
      {/* Mouth */}
      <mesh position={[0, 0.01, 0.115]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.025, 0.005, 6, 12, Math.PI]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      {/* Shine */}
      <mesh position={[0.05, 0.06, 0.1]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshBasicMaterial color="#a16207" transparent opacity={0.7} />
      </mesh>
    </group>
  )
}

function BrickShape() {
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[0.32, 0.16, 0.18]} />
        <meshStandardMaterial color="#9a3412" roughness={1} flatShading />
      </mesh>
      {/* Mortar lines as inset darker stripes */}
      <mesh position={[0, 0.081, 0]}>
        <boxGeometry args={[0.33, 0.005, 0.19]} />
        <meshStandardMaterial color="#3f1f0d" />
      </mesh>
      <mesh position={[0, -0.081, 0]}>
        <boxGeometry args={[0.33, 0.005, 0.19]} />
        <meshStandardMaterial color="#3f1f0d" />
      </mesh>
      {/* Speckles */}
      {[
        [0.08, 0.04, 0.092],
        [-0.1, -0.02, 0.092],
        [0.04, -0.05, 0.092],
        [-0.06, 0.06, -0.092],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshStandardMaterial color="#7c2d12" />
        </mesh>
      ))}
    </group>
  )
}

function CakeShape() {
  // Two-tier birthday cake with frosting drips, sprinkles and a lit candle
  const sponge = '#fef3c7'
  const frosting = '#fce7f3'
  const frostingDark = '#fbcfe8'
  return (
    <group>
      {/* --- Bottom tier --- */}
      <mesh castShadow position={[0, -0.07, 0]}>
        <cylinderGeometry args={[0.16, 0.17, 0.11, 28]} />
        <meshStandardMaterial color={sponge} roughness={0.9} />
      </mesh>
      {/* Frosting cap on bottom tier */}
      <mesh castShadow position={[0, -0.005, 0]}>
        <cylinderGeometry args={[0.165, 0.165, 0.018, 28]} />
        <meshStandardMaterial color={frosting} roughness={0.5} />
      </mesh>
      {/* Frosting drips around the rim of the bottom tier */}
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2
        return (
          <mesh key={'d' + i} position={[Math.cos(a) * 0.16, -0.03, Math.sin(a) * 0.16]}>
            <sphereGeometry args={[0.022, 8, 8]} />
            <meshStandardMaterial color={frostingDark} roughness={0.5} />
          </mesh>
        )
      })}

      {/* --- Top tier (smaller) --- */}
      <mesh castShadow position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.11, 0.115, 0.08, 24]} />
        <meshStandardMaterial color={sponge} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.105, 0]}>
        <cylinderGeometry args={[0.115, 0.115, 0.015, 24]} />
        <meshStandardMaterial color={frosting} roughness={0.5} />
      </mesh>
      {/* Frosting drips around top tier */}
      {Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2
        return (
          <mesh key={'d2' + i} position={[Math.cos(a) * 0.111, 0.087, Math.sin(a) * 0.111]}>
            <sphereGeometry args={[0.016, 8, 8]} />
            <meshStandardMaterial color={frostingDark} roughness={0.5} />
          </mesh>
        )
      })}

      {/* --- Candle --- */}
      <mesh castShadow position={[0, 0.155, 0]}>
        <cylinderGeometry args={[0.009, 0.009, 0.08, 8]} />
        <meshStandardMaterial color="#e0e7ff" />
      </mesh>
      {/* Candle stripe (party look) */}
      <mesh position={[0, 0.155, 0]} rotation={[0, 0.4, 0.3]}>
        <torusGeometry args={[0.009, 0.002, 4, 12]} />
        <meshStandardMaterial color="#7c3aed" />
      </mesh>
      {/* Wick */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.002, 0.002, 0.012, 6]} />
        <meshBasicMaterial color="#1c1917" />
      </mesh>
      {/* Flame */}
      <mesh position={[0, 0.215, 0]}>
        <coneGeometry args={[0.014, 0.035, 8]} />
        <meshStandardMaterial color="#fde047" emissive="#f97316" emissiveIntensity={2.5} />
      </mesh>
      <pointLight position={[0, 0.21, 0]} color="#fb923c" intensity={1} distance={1.4} />

      {/* --- Sprinkles on bottom tier frosting --- */}
      {Array.from({ length: 18 }).map((_, i) => {
        const a = (i / 18) * Math.PI * 2 + 0.2
        const r = 0.08 + (i % 3) * 0.025
        const colors = ['#dc2626', '#facc15', '#22d3ee', '#a855f7', '#22c55e']
        const c = colors[i % colors.length]
        return (
          <mesh
            key={'sp' + i}
            position={[Math.cos(a) * r, 0.005, Math.sin(a) * r]}
            rotation={[0, a, Math.PI / 3]}
          >
            <cylinderGeometry args={[0.006, 0.006, 0.025, 6]} />
            <meshStandardMaterial color={c} />
          </mesh>
        )
      })}

      {/* Cherries on top tier */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + 0.5
        return (
          <group key={'c' + i} position={[Math.cos(a) * 0.07, 0.118, Math.sin(a) * 0.07]}>
            <mesh castShadow>
              <sphereGeometry args={[0.018, 12, 12]} />
              <meshStandardMaterial color="#dc2626" roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.02, 0]} rotation={[0, 0, 0.4]}>
              <cylinderGeometry args={[0.0015, 0.0015, 0.025, 6]} />
              <meshStandardMaterial color="#65a30d" />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function BananaShape() {
  // Real-looking curved banana built from a TubeGeometry along a CatmullRom path
  const geom = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.22, -0.04, 0),
      new THREE.Vector3(-0.13, 0.07, 0),
      new THREE.Vector3(0.0, 0.1, 0),
      new THREE.Vector3(0.13, 0.07, 0),
      new THREE.Vector3(0.22, -0.04, 0),
    ])
    return new THREE.TubeGeometry(curve, 32, 0.035, 16, false)
  }, [])

  return (
    <group rotation={[0, 0, 0.2]}>
      {/* Main curved body */}
      <mesh castShadow geometry={geom}>
        <meshStandardMaterial color="#facc15" roughness={0.6} />
      </mesh>

      {/* Subtle ridges along the length (3 darker strips) */}
      {[-0.025, 0, 0.025].map((offset, i) => (
        <mesh key={i} castShadow position={[0, 0, offset]} geometry={geom} scale={[1, 1.001, 0.18]}>
          <meshStandardMaterial color={i === 1 ? '#ca8a04' : '#eab308'} roughness={0.7} />
        </mesh>
      ))}

      {/* Stem (green nub) */}
      <mesh position={[0.225, -0.045, 0]} rotation={[0, 0, -1.2]} castShadow>
        <cylinderGeometry args={[0.012, 0.018, 0.045, 8]} />
        <meshStandardMaterial color="#65a30d" roughness={0.8} />
      </mesh>
      {/* Stem tip cap */}
      <mesh position={[0.245, -0.07, 0]}>
        <sphereGeometry args={[0.013, 8, 8]} />
        <meshStandardMaterial color="#4d7c0f" />
      </mesh>

      {/* Brown bottom tip */}
      <mesh position={[-0.225, -0.045, 0]} rotation={[0, 0, 1.2]}>
        <coneGeometry args={[0.025, 0.04, 8]} />
        <meshStandardMaterial color="#78350f" roughness={0.9} />
      </mesh>

      {/* Brown bruise spots for realism */}
      {[
        [-0.05, 0.105, 0.025],
        [0.08, 0.085, -0.025],
      ].map((p, i) => (
        <mesh key={'b' + i} position={p as [number, number, number]} scale={[1, 0.5, 1]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshStandardMaterial color="#78350f" roughness={0.9} transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  )
}

function BowlingBallShape() {
  return (
    <group>
      <mesh castShadow>
        <sphereGeometry args={[0.16, 28, 28]} />
        <meshStandardMaterial color="#171717" roughness={0.2} metalness={0.3} />
      </mesh>
      {/* Marbled swirl as a darker patch */}
      <mesh rotation={[0.4, 0.6, 0]}>
        <torusGeometry args={[0.11, 0.012, 4, 32]} />
        <meshStandardMaterial color="#404040" roughness={0.3} metalness={0.3} />
      </mesh>
      {/* Three finger holes */}
      {[
        [0.04, 0.13, 0.05],
        [-0.04, 0.13, 0.05],
        [0, 0.13, -0.05],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <cylinderGeometry args={[0.018, 0.018, 0.04, 12]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
      ))}
    </group>
  )
}

// Returns the collider args for each kind. For irregular shapes we approximate
// with a box; rapier needs primitive colliders.
export function getCollider(kind: ProjectileKind):
  | { type: 'ball'; radius: number }
  | { type: 'cuboid'; half: [number, number, number] } {
  switch (kind) {
    case 'chair':
      return { type: 'cuboid', half: [0.28, 0.32, 0.28] }
    case 'water':
      return { type: 'cuboid', half: [0.13, 0.18, 0.13] }
    case 'tv':
      return { type: 'cuboid', half: [0.36, 0.24, 0.07] }
    case 'gun':
      return { type: 'ball', radius: 0.05 }
    case 'shit':
      return { type: 'ball', radius: 0.13 }
    case 'brick':
      return { type: 'cuboid', half: [0.16, 0.08, 0.09] }
    case 'cake':
      return { type: 'cuboid', half: [0.16, 0.08, 0.16] }
    case 'banana':
      return { type: 'cuboid', half: [0.2, 0.06, 0.07] }
    case 'bowlingBall':
      return { type: 'ball', radius: 0.16 }
    case 'egg':
      return { type: 'ball', radius: PROJECTILE.radius * 1.05 }
    case 'rock':
      return { type: 'ball', radius: PROJECTILE.radius * 1.05 }
    default:
      return { type: 'ball', radius: PROJECTILE.radius }
  }
}
