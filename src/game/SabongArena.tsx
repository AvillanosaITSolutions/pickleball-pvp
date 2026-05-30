import { useMemo } from 'react'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'

// Cockfighting ring: circular sand pit, low wooden fence around the perimeter,
// dark crowd-silhouette backdrop. Self-contained — does not reuse the rage room.

export const ARENA_RADIUS = 10
const FENCE_HEIGHT = 0.7
const POST_COUNT = 24

export function SabongArena() {
  // Pre-compute fence post positions around the ring
  const posts = useMemo(() => {
    const out: Array<{ x: number; z: number; ry: number }> = []
    for (let i = 0; i < POST_COUNT; i++) {
      const a = (i / POST_COUNT) * Math.PI * 2
      out.push({ x: Math.cos(a) * ARENA_RADIUS, z: Math.sin(a) * ARENA_RADIUS, ry: -a })
    }
    return out
  }, [])

  return (
    <group>
      {/* Sky / void backdrop */}
      <mesh position={[0, 8, 0]} scale={[60, 30, 60]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshBasicMaterial color="#0a0a0a" side={THREE.BackSide} />
      </mesh>

      {/* Sand floor (collider — players walk on this) */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh receiveShadow position={[0, -0.05, 0]}>
          <cylinderGeometry args={[ARENA_RADIUS + 0.4, ARENA_RADIUS + 0.4, 0.1, 64]} />
          <meshStandardMaterial color="#c2986a" roughness={0.95} />
        </mesh>
      </RigidBody>

      {/* Inner ring marking (slightly darker dirt circle) */}
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ARENA_RADIUS - 0.3, ARENA_RADIUS - 0.05, 64]} />
        <meshStandardMaterial color="#8a6740" roughness={1} />
      </mesh>
      {/* Center scratch line — traditional sabong reference */}
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.0, 32]} />
        <meshStandardMaterial color="#5a3f25" roughness={1} />
      </mesh>

      {/* Wooden fence posts + top rail */}
      {posts.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.ry, 0]}>
          <mesh castShadow position={[0, FENCE_HEIGHT / 2, 0]}>
            <boxGeometry args={[0.12, FENCE_HEIGHT, 0.12]} />
            <meshStandardMaterial color="#6b4423" />
          </mesh>
        </group>
      ))}
      {/* Top rail — a thin torus sitting on the posts */}
      <mesh position={[0, FENCE_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[ARENA_RADIUS, 0.06, 8, 96]} />
        <meshStandardMaterial color="#8b5a2b" />
      </mesh>
      {/* Mid rail */}
      <mesh position={[0, FENCE_HEIGHT * 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[ARENA_RADIUS, 0.04, 6, 96]} />
        <meshStandardMaterial color="#704826" />
      </mesh>

      {/* Crowd silhouettes — low-poly ring of dark cylinders behind the fence */}
      <CrowdRing />

      {/* Overhead spotlight to focus the action */}
      <spotLight
        position={[0, 12, 0]}
        target-position={[0, 0, 0]}
        angle={0.7}
        penumbra={0.4}
        intensity={40}
        distance={20}
        color="#fff4d6"
        castShadow
      />
    </group>
  )
}

function CrowdRing() {
  const heads = useMemo(() => {
    const out: Array<{ x: number; z: number; h: number }> = []
    const N = 56
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const r = ARENA_RADIUS + 1.8 + Math.random() * 0.6
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: 1.4 + Math.random() * 0.5 })
    }
    return out
  }, [])
  return (
    <group>
      {heads.map((p, i) => (
        <mesh key={i} position={[p.x, p.h / 2, p.z]}>
          <capsuleGeometry args={[0.22, p.h - 0.4, 4, 8]} />
          <meshStandardMaterial color="#1a1a1a" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}
