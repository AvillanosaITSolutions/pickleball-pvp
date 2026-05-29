import { useMemo } from 'react'
import { RigidBody } from '@react-three/rapier'
import { ROOM } from './constants'
import { useLoadedTexture } from './useLoadedTexture'

/**
 * Hate-photo gallery: scattered slanted frames mounted on the two side walls,
 * each showing one of /public/posters/{1..16}.png. The frames are tilted
 * casually (small Z rotation) to feel scrappy/lived-in rather than museum-tidy.
 *
 * Layout: 8 frames on the left wall + 8 on the right wall, distributed across
 * the room depth and height with deterministic randomness (so layout is
 * stable across reloads). Each is a fixed RigidBody so projectiles bounce off.
 */

const POSTER_COUNT = 16

interface FrameSpec {
  url: string
  position: [number, number, number]
  rotation: [number, number, number]
  width: number
  height: number
}

function PhotoFrame({ spec }: { spec: FrameSpec }) {
  const tex = useLoadedTexture(spec.url)
  const { width, height } = spec
  return (
    <RigidBody
      type="fixed"
      position={spec.position}
      rotation={spec.rotation}
      colliders="cuboid"
      friction={0.6}
      restitution={0.2}
    >
      {/* dark frame body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width + 0.08, height + 0.08, 0.06]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.7} />
      </mesh>
      {/* inner mat */}
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[width + 0.02, height + 0.02]} />
        <meshStandardMaterial color="#262626" />
      </mesh>
      {/* photo */}
      <mesh position={[0, 0, 0.036]}>
        <planeGeometry args={[width, height]} />
        {tex ? (
          <meshStandardMaterial
            key={tex.uuid}
            map={tex}
            toneMapped={false}
            roughness={0.5}
          />
        ) : (
          <meshStandardMaterial color="#3f3f46" />
        )}
      </mesh>
    </RigidBody>
  )
}

export function HateWalls() {
  const frames = useMemo<FrameSpec[]>(() => {
    const r = mulberry32(7777)
    const out: FrameSpec[] = []
    // Side walls — tuck a bit in from each edge so the frame doesn't clip
    const wallOffset = 0.08
    const wallX = ROOM.width / 2 - wallOffset

    // Each side gets 8 frames, distributed along depth & height
    for (let side = 0; side < 2; side++) {
      const onLeft = side === 0
      const x = onLeft ? -wallX : wallX
      // Plane faces +Z by default; we need +X (left wall) or -X (right wall)
      const rotY = onLeft ? Math.PI / 2 : -Math.PI / 2

      for (let i = 0; i < 8; i++) {
        const posterIndex = side * 8 + i + 1 // 1..16
        const url = `/posters/${posterIndex}.png`

        // Spread along Z: split room depth into 8 slots, jitter within each
        const slotT = i / 8 + 1 / 16
        const z =
          -ROOM.depth / 2 + 1.5 +
          slotT * (ROOM.depth - 3) +
          (r() - 0.5) * 1.0

        // Spread height — alternate higher/lower so they don't all line up
        const y = 1.6 + (i % 2 === 0 ? 0 : 1.2) + (r() - 0.5) * 0.6

        // Slight crooked tilt — visible enough to read as casual, not falling-off
        const tilt = (r() - 0.5) * 0.22

        // Tiny forward/backward lean, randomized — feels three-dimensional
        const lean = (r() - 0.5) * 0.06

        // Vary size a bit
        const aspect = 0.85 + r() * 0.5 // portrait ↔ landscape mix
        const width = 0.9 + r() * 0.5
        const height = width / aspect

        out.push({
          url,
          position: [x, y, z],
          rotation: [lean, rotY, tilt],
          width,
          height,
        })
      }
    }
    return out
  }, [])

  return (
    <group>
      {frames.map((f, i) => (
        <PhotoFrame key={i} spec={f} />
      ))}
    </group>
  )
}

// Deterministic PRNG — same layout every reload
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

// Ensure POSTER_COUNT is used so TypeScript doesn't complain
void POSTER_COUNT
