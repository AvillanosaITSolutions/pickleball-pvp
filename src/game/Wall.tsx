import { useMemo } from 'react'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { WALL, ROOM } from './constants'
import { useGame } from './store'
import type { Splat } from './store'
import { useLoadedTexture } from './useLoadedTexture'

export const WALL_NAME = 'angerWall'

export function Wall({ photoUrl }: { photoUrl?: string | null }) {
  const storedPhotoUrl = useGame((s) => s.photoUrl)
  const splats = useGame((s) => s.splats)
  const effectiveUrl = photoUrl ?? storedPhotoUrl
  const texture = useLoadedTexture(effectiveUrl)
  console.log('[Wall] render', { photoUrl: effectiveUrl, hasTexture: !!texture, texUuid: texture?.uuid })

  return (
    <group>
      <RigidBody
        type="fixed"
        colliders="cuboid"
        friction={0.6}
        restitution={0.15}
        name={WALL_NAME}
      >
        <mesh position={[0, ROOM.height / 2, WALL.z]} receiveShadow>
          <boxGeometry args={[ROOM.width, ROOM.height, 0.2]} />
          <meshStandardMaterial color="#71717a" />
        </mesh>
      </RigidBody>

      <group position={[0, WALL.y, WALL.z + 0.11]}>
        <mesh>
          <planeGeometry args={[WALL.width + 0.3, WALL.height + 0.3]} />
          <meshStandardMaterial color="#18181b" />
        </mesh>
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[WALL.width, WALL.height]} />
          {texture ? (
            <meshStandardMaterial
              key={texture.uuid}
              map={texture}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          ) : (
            <meshStandardMaterial key="no-tex" color="#a1a1aa" />
          )}
        </mesh>

        {splats.map((s, idx) => (
          <SplatterMark key={s.id} splat={s} layer={idx} />
        ))}
      </group>
    </group>
  )
}

// Deterministic pseudo-random from a seed so each splat re-renders identically
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function SplatterMark({ splat, layer }: { splat: Splat; layer: number }) {
  const z = 0.02 + (layer % 40) * 0.0008

  if (splat.kind === 'gun') {
    return <BulletHole2D splat={splat} z={z} />
  }

  // Build a deterministic blob shape from the splat id
  const { mainShape, drips, streak } = useMemo(() => {
    const r = rng(splat.id * 9301 + 49297)
    // Irregular main blob: a polygon with perturbed radii
    const points: THREE.Vector2[] = []
    const segs = 18
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2
      const wobble = 0.65 + r() * 0.75 // 0.65..1.4
      const radius = splat.radius * wobble
      points.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * radius))
    }
    const mainShape = new THREE.Shape(points)

    // Satellite drips around main blob
    const dripCount = 4 + Math.floor(r() * 6)
    const drips: Array<{ x: number; y: number; r: number; opacity: number }> = []
    for (let i = 0; i < dripCount; i++) {
      const a = r() * Math.PI * 2
      const dist = splat.radius * (0.7 + r() * 1.2)
      drips.push({
        x: Math.cos(a) * dist,
        y: Math.sin(a) * dist,
        r: splat.radius * (0.1 + r() * 0.35),
        opacity: 0.55 + r() * 0.35,
      })
    }

    // Vertical drip streak (gravity)
    const streakLen = splat.radius * (1.5 + r() * 2.5)
    const streakWidth = splat.radius * (0.15 + r() * 0.2)
    const streak = { length: streakLen, width: streakWidth, x: (r() - 0.5) * splat.radius * 0.6 }

    return { mainShape, drips, streak }
  }, [splat.id, splat.radius])

  // Tint variants for layered look
  const colorDark = useMemo(() => shade(splat.color, -0.25), [splat.color])
  const colorLight = useMemo(() => shade(splat.color, 0.15), [splat.color])

  return (
    <group position={[splat.x, splat.y, z]} rotation={[0, 0, splat.rotation]}>
      {/* Outer wet halo */}
      <mesh position={[0, 0, -0.0005]}>
        <circleGeometry args={[splat.radius * 1.35, 24]} />
        <meshBasicMaterial color={colorDark} transparent opacity={0.35} />
      </mesh>

      {/* Drip streak going down */}
      <mesh position={[streak.x, -streak.length / 2 - splat.radius * 0.6, 0.0002]}>
        <planeGeometry args={[streak.width, streak.length]} />
        <meshBasicMaterial color={splat.color} transparent opacity={0.75} />
      </mesh>
      {/* Streak droplet at bottom */}
      <mesh
        position={[streak.x, -streak.length - splat.radius * 0.6, 0.0003]}
      >
        <circleGeometry args={[streak.width * 1.6, 12]} />
        <meshBasicMaterial color={splat.color} transparent opacity={0.8} />
      </mesh>

      {/* Main irregular blob */}
      <mesh position={[0, 0, 0.0004]}>
        <shapeGeometry args={[mainShape]} />
        <meshBasicMaterial color={splat.color} transparent opacity={0.92} />
      </mesh>

      {/* Bright center highlight */}
      <mesh position={[0, 0, 0.0006]}>
        <circleGeometry args={[splat.radius * 0.55, 16]} />
        <meshBasicMaterial color={colorLight} transparent opacity={0.55} />
      </mesh>

      {/* Satellite drips */}
      {drips.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, 0.0005]}>
          <circleGeometry args={[d.r, 12]} />
          <meshBasicMaterial color={splat.color} transparent opacity={d.opacity} />
        </mesh>
      ))}

    </group>
  )
}

function BulletHole2D({ splat, z }: { splat: Splat; z: number }) {
  const r = splat.radius
  // A few short cracks radiating from the hole
  const cracks = useMemo(() => {
    const rand = rng(splat.id * 7919 + 1597)
    const n = 3 + Math.floor(rand() * 4)
    const out: { angle: number; len: number; width: number }[] = []
    for (let i = 0; i < n; i++) {
      out.push({
        angle: rand() * Math.PI * 2,
        len: r * (1.2 + rand() * 1.8),
        width: r * (0.08 + rand() * 0.06),
      })
    }
    return out
  }, [splat.id, r])

  return (
    <group position={[splat.x, splat.y, z]} rotation={[0, 0, splat.rotation]}>
      {/* Powder ring */}
      <mesh position={[0, 0, -0.0002]}>
        <ringGeometry args={[r * 1.0, r * 1.9, 22]} />
        <meshBasicMaterial color="#4b5563" transparent opacity={0.45} />
      </mesh>
      {/* Cracks */}
      {cracks.map((c, i) => (
        <mesh
          key={i}
          position={[
            Math.cos(c.angle) * (r + c.len / 2),
            Math.sin(c.angle) * (r + c.len / 2),
            0.0001,
          ]}
          rotation={[0, 0, c.angle + Math.PI / 2]}
        >
          <planeGeometry args={[c.width, c.len]} />
          <meshBasicMaterial color="#1f2937" transparent opacity={0.85} />
        </mesh>
      ))}
      {/* The hole */}
      <mesh position={[0, 0, 0.0003]}>
        <circleGeometry args={[r, 18]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
    </group>
  )
}

// Lighten/darken a hex color by amt in [-1, 1]
function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex)
  if (amt > 0) c.lerp(new THREE.Color('#ffffff'), amt)
  else c.lerp(new THREE.Color('#000000'), -amt)
  return '#' + c.getHexString()
}
