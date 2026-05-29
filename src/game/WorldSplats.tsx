import { useMemo } from 'react'
import { create } from 'zustand'
import * as THREE from 'three'

/**
 * World-space splats: bullet marks (and any other generic decals) that aren't
 * attached to a specific wall or the dummy. Used by the gun to leave a visible
 * mark on whatever surface it hit, even a moving prop. The mark is in world
 * coordinates so it doesn't follow the prop if it gets knocked away.
 */

export type WorldSplatStyle = 'bullet' | 'splat'

export interface WorldSplat {
  id: number
  x: number
  y: number
  z: number
  // outward surface normal (orients the mark plane so it sits on the surface)
  nx: number
  ny: number
  nz: number
  color: string
  radius: number
  style: WorldSplatStyle
  seed: number // for shape variation
}

interface WorldSplatStore {
  splats: WorldSplat[]
  add: (s: Omit<WorldSplat, 'id'>) => void
  clear: () => void
}

let nextId = 1
export const useWorldSplats = create<WorldSplatStore>((set) => ({
  splats: [],
  add: (s) =>
    set((state) => ({
      splats: [...state.splats, { id: nextId++, ...s }].slice(-150),
    })),
  clear: () => set({ splats: [] }),
}))

export function WorldSplats() {
  const splats = useWorldSplats((s) => s.splats)
  return (
    <group>
      {splats.map((s, i) => (
        <Mark key={s.id} splat={s} layer={i} />
      ))}
    </group>
  )
}

function Mark({ splat, layer }: { splat: WorldSplat; layer: number }) {
  // Orient the plane so its +Z faces along the surface normal, aligned upward
  const quat = useMemo(() => {
    const n = new THREE.Vector3(splat.nx, splat.ny, splat.nz)
    const len = n.length()
    if (len < 1e-4) return new THREE.Quaternion()
    n.multiplyScalar(1 / len)
    const up = new THREE.Vector3(0, 1, 0)
    let yAxis = up.clone().sub(n.clone().multiplyScalar(up.dot(n)))
    if (yAxis.lengthSq() < 1e-4) yAxis.set(0, 0, -1)
    yAxis.normalize()
    const xAxis = new THREE.Vector3().crossVectors(yAxis, n).normalize()
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, n)
    return new THREE.Quaternion().setFromRotationMatrix(m)
  }, [splat.nx, splat.ny, splat.nz])

  const offset = 0.003 + (layer % 40) * 0.0008
  const position: [number, number, number] = [
    splat.x + splat.nx * offset,
    splat.y + splat.ny * offset,
    splat.z + splat.nz * offset,
  ]

  if (splat.style === 'bullet') {
    return (
      <group position={position} quaternion={quat}>
        <mesh>
          <ringGeometry args={[splat.radius * 0.6, splat.radius * 1.4, 16]} />
          <meshBasicMaterial color="#4b5563" transparent opacity={0.45} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, 0.0005]}>
          <circleGeometry args={[splat.radius * 0.55, 14]} />
          <meshBasicMaterial color={splat.color} depthWrite={false} />
        </mesh>
      </group>
    )
  }
  return <SplatMark splat={splat} position={position} quaternion={quat} />
}

function SplatMark({
  splat, position, quaternion,
}: {
  splat: WorldSplat
  position: [number, number, number]
  quaternion: THREE.Quaternion
}) {
  // Irregular polygon blob + small satellite drips + a downward streak.
  // Cheap, looks like a fresh splatter.
  const { mainShape, drips } = useMemo(() => {
    const r = rng(splat.seed)
    const points: THREE.Vector2[] = []
    const segs = 14
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2
      const wobble = 0.55 + r() * 0.9
      const rad = splat.radius * wobble
      points.push(new THREE.Vector2(Math.cos(a) * rad, Math.sin(a) * rad))
    }
    const shape = new THREE.Shape(points)
    const dripCount = 3 + Math.floor(r() * 4)
    const drips: Array<{ x: number; y: number; r: number; o: number }> = []
    for (let i = 0; i < dripCount; i++) {
      const a = r() * Math.PI * 2
      const dist = splat.radius * (0.7 + r() * 1.0)
      drips.push({
        x: Math.cos(a) * dist,
        y: Math.sin(a) * dist,
        r: splat.radius * (0.1 + r() * 0.3),
        o: 0.55 + r() * 0.3,
      })
    }
    return { mainShape: shape, drips }
  }, [splat.seed, splat.radius])

  return (
    <group position={position} quaternion={quaternion}>
      {/* Main blob */}
      <mesh>
        <shapeGeometry args={[mainShape]} />
        <meshBasicMaterial color={splat.color} transparent opacity={0.92} depthWrite={false} />
      </mesh>
      {/* Streak / drip down (only on surfaces facing roughly outward — looks fine even on floors) */}
      <mesh position={[0, -splat.radius * 1.2, 0.0001]}>
        <planeGeometry args={[splat.radius * 0.3, splat.radius * 1.6]} />
        <meshBasicMaterial color={splat.color} transparent opacity={0.75} depthWrite={false} />
      </mesh>
      {/* Satellite drips */}
      {drips.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, 0.0002]}>
          <circleGeometry args={[d.r, 10]} />
          <meshBasicMaterial color={splat.color} transparent opacity={d.o} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}
