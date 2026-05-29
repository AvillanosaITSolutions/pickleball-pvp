import { useMemo } from 'react'
import * as THREE from 'three'
import type { DummySplat } from './store'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex)
  if (amt > 0) c.lerp(new THREE.Color('#ffffff'), amt)
  else c.lerp(new THREE.Color('#000000'), -amt)
  return '#' + c.getHexString()
}

interface Props {
  splat: DummySplat
  layer: number
}

// A splat oriented in 3D — placed at local pos, facing along the outward normal,
// slightly offset so it doesn't z-fight with the body surface.
export function SplatMark3D({ splat, layer }: Props) {
  if (splat.kind === 'gun') {
    return <BulletHole3D splat={splat} layer={layer} />
  }
  return <PaintSplat splat={splat} layer={layer} />
}

function PaintSplat({ splat, layer }: Props) {
  const { mainShape, drips, streaks } = useMemo(() => {
    const r = rng(splat.id * 9301 + 49297)
    // Irregular main blob
    const points: THREE.Vector2[] = []
    const segs = 18
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2
      const wobble = 0.55 + r() * 0.95
      const radius = splat.radius * wobble
      points.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * radius))
    }
    const mainShape = new THREE.Shape(points)

    // Satellite spatter blobs
    const dripCount = 5 + Math.floor(r() * 6)
    const drips: Array<{ x: number; y: number; r: number; opacity: number }> = []
    for (let i = 0; i < dripCount; i++) {
      const a = r() * Math.PI * 2
      // Bias toward downward direction for spatter (gravity)
      const angle = a * 0.6 - Math.PI / 2 * 0.5
      const dist = splat.radius * (0.75 + r() * 1.3)
      drips.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        r: splat.radius * (0.1 + r() * 0.32),
        opacity: 0.5 + r() * 0.4,
      })
    }

    // Multiple drip streaks running down from the main blob
    const streakCount = splat.onHead ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * 3)
    const streaks: Array<{
      x: number
      length: number
      width: number
      blobR: number
      opacity: number
    }> = []
    for (let i = 0; i < streakCount; i++) {
      const length = splat.radius * (1.6 + r() * 3.5)
      const width = splat.radius * (0.08 + r() * 0.18)
      streaks.push({
        x: (r() - 0.5) * splat.radius * 1.2,
        length,
        width,
        blobR: width * (1.4 + r() * 0.8),
        opacity: 0.6 + r() * 0.3,
      })
    }

    return { mainShape, drips, streaks }
  }, [splat.id, splat.radius, splat.onHead])

  // Orient plane so +Z faces outward along the normal AND +Y points "up"
  // (world up projected onto the splat plane), so drips run straight down.
  const quat = useMemo(() => {
    const n = new THREE.Vector3(splat.nx, splat.ny, splat.nz).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    let yAxis = up.clone().sub(n.clone().multiplyScalar(up.dot(n)))
    if (yAxis.lengthSq() < 1e-4) {
      // Normal is vertical (e.g. top of head) — pick an arbitrary horizontal axis
      yAxis.set(0, 0, -1)
    }
    yAxis.normalize()
    const xAxis = new THREE.Vector3().crossVectors(yAxis, n).normalize()
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, n)
    return new THREE.Quaternion().setFromRotationMatrix(m)
  }, [splat.nx, splat.ny, splat.nz])

  const colorLight = useMemo(() => shade(splat.color, 0.15), [splat.color])
  const colorDark = useMemo(() => shade(splat.color, -0.25), [splat.color])

  // Push the splat slightly outward so it sits on the surface
  const offset = 0.005 + (layer % 30) * 0.0006
  const pos = new THREE.Vector3(
    splat.lx + splat.nx * offset,
    splat.ly + splat.ny * offset,
    splat.lz + splat.nz * offset,
  )

  // Tiny random tilt around the normal so identical splats don't look stamped.
  // Drips stay close to vertical because the rotation is small (±0.25 rad).
  const tilt = ((splat.rotation || 0) % 1) * 0.5 - 0.25

  return (
    <group position={pos} quaternion={quat} rotation={[0, 0, tilt]}>
      {/* Outer wet halo */}
      <mesh position={[0, 0, -0.0005]}>
        <circleGeometry args={[splat.radius * 1.4, 24]} />
        <meshBasicMaterial color={colorDark} transparent opacity={0.3} />
      </mesh>

      {/* Drip streaks running straight down (gravity) */}
      {streaks.map((s, i) => (
        <group key={'s' + i} position={[s.x, 0, 0.0001 + i * 0.00015]}>
          <mesh position={[0, -splat.radius * 0.6 - s.length / 2, 0]}>
            <planeGeometry args={[s.width, s.length]} />
            <meshBasicMaterial color={splat.color} transparent opacity={s.opacity} />
          </mesh>
          {/* Droplet at the tip of the streak */}
          <mesh position={[0, -splat.radius * 0.6 - s.length, 0.0001]}>
            <circleGeometry args={[s.blobR, 14]} />
            <meshBasicMaterial color={splat.color} transparent opacity={s.opacity + 0.1} />
          </mesh>
        </group>
      ))}

      {/* Main irregular blob */}
      <mesh position={[0, 0, 0.0005]}>
        <shapeGeometry args={[mainShape]} />
        <meshBasicMaterial color={splat.color} transparent opacity={0.94} />
      </mesh>

      {/* Bright center */}
      <mesh position={[0, 0, 0.0007]}>
        <circleGeometry args={[splat.radius * 0.5, 16]} />
        <meshBasicMaterial color={colorLight} transparent opacity={0.55} />
      </mesh>

      {/* Satellite spatter */}
      {drips.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, 0.0006]}>
          <circleGeometry args={[d.r, 12]} />
          <meshBasicMaterial color={splat.color} transparent opacity={d.opacity} />
        </mesh>
      ))}

    </group>
  )
}

function BulletHole3D({ splat, layer }: Props) {
  const quat = useMemo(() => {
    const n = new THREE.Vector3(splat.nx, splat.ny, splat.nz).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    let yAxis = up.clone().sub(n.clone().multiplyScalar(up.dot(n)))
    if (yAxis.lengthSq() < 1e-4) yAxis.set(0, 0, -1)
    yAxis.normalize()
    const xAxis = new THREE.Vector3().crossVectors(yAxis, n).normalize()
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, n)
    return new THREE.Quaternion().setFromRotationMatrix(m)
  }, [splat.nx, splat.ny, splat.nz])

  const offset = 0.005 + (layer % 30) * 0.0006
  const pos = new THREE.Vector3(
    splat.lx + splat.nx * offset,
    splat.ly + splat.ny * offset,
    splat.lz + splat.nz * offset,
  )
  const r = splat.radius

  return (
    <group position={pos} quaternion={quat} rotation={[0, 0, splat.rotation]}>
      {/* Bruise / powder ring */}
      <mesh position={[0, 0, -0.0003]}>
        <ringGeometry args={[r * 0.9, r * 2.0, 20]} />
        <meshBasicMaterial color="#450a0a" transparent opacity={0.5} />
      </mesh>
      {/* Blood drip down (body only, not face) */}
      {!splat.onHead && (
        <mesh position={[0, -r * 2.5, 0.0001]}>
          <planeGeometry args={[r * 0.35, r * 4]} />
          <meshBasicMaterial color="#7f1d1d" transparent opacity={0.85} />
        </mesh>
      )}
      {/* Wound center */}
      <mesh position={[0, 0, 0.0002]}>
        <circleGeometry args={[r * 1.1, 14]} />
        <meshBasicMaterial color="#7f1d1d" />
      </mesh>
      {/* Hole */}
      <mesh position={[0, 0, 0.0004]}>
        <circleGeometry args={[r * 0.6, 12]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
    </group>
  )
}
