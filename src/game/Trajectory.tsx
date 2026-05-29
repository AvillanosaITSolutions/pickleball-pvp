import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from './store'
import { PROJECTILE } from './constants'

/**
 * Live ballistic trajectory preview shown while charging a throw.
 * Hidden when:
 *   - not charging (charge === 0)
 *   - gun selected (instant hitscan, no arc)
 *
 * Path matches Player.throwProjectile exactly: same origin offset, same
 * speed/lift formula, same gravity. Updates every frame so as you charge
 * up the arc rises and lengthens.
 */
const STEPS = 32
const DT = 0.05
const GRAVITY = 9.81

export function Trajectory() {
  const { camera } = useThree()
  const charge = useGame((s) => s.charge)
  const selectedKind = useGame((s) => s.selectedKind)
  const pointsRef = useRef<THREE.Points>(null)
  const geomRef = useRef<THREE.BufferGeometry>(null)

  const positions = useMemo(() => new Float32Array(STEPS * 3), [])

  useFrame(() => {
    const visible = charge > 0 && selectedKind !== 'gun'
    if (pointsRef.current) pointsRef.current.visible = visible
    if (!visible) return

    const power = THREE.MathUtils.clamp(charge, 0.1, 1)
    const speed = THREE.MathUtils.lerp(PROJECTILE.minPower, PROJECTILE.maxPower, power)
    const lift = (1 - power) * 1.5

    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir).normalize()

    // Origin must match Player.throwProjectile: camera + 0.6×dir + (0,-0.2,0)
    const p = camera.position.clone()
      .addScaledVector(dir, 0.6)
      .add(new THREE.Vector3(0, -0.2, 0))

    const v = new THREE.Vector3(dir.x * speed, dir.y * speed + lift, dir.z * speed)

    // Simulate the path forward; clamp to ground (y=0.05) and lock remaining
    // points there to avoid the arc visually plunging through the floor.
    let grounded = false
    for (let i = 0; i < STEPS; i++) {
      const off = i * 3
      positions[off] = p.x
      positions[off + 1] = p.y
      positions[off + 2] = p.z
      if (!grounded) {
        p.x += v.x * DT
        p.y += v.y * DT
        p.z += v.z * DT
        v.y -= GRAVITY * DT
        if (p.y < 0.05) {
          p.y = 0.05
          grounded = true
        }
      }
    }

    if (geomRef.current) {
      ;(geomRef.current.attributes.position as THREE.BufferAttribute).needsUpdate = true
    }
  })

  return (
    <points ref={pointsRef} renderOrder={999}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#facc15"
        size={0.09}
        sizeAttenuation
        transparent
        opacity={0.85}
        depthTest={false}
      />
    </points>
  )
}
