import { useRef, useEffect } from 'react'
import { RigidBody, BallCollider, CuboidCollider } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WALL, ROOM } from './constants'

const ROOM_BACK = ROOM.depth / 2 - 1.8
import { useGame, KIND_INFO } from './store'
import type { ProjectileKind } from './store'
import { WALL_NAME } from './Wall'
import { DUMMY_NAME, DUMMY_HEAD_NAME } from './Dummy'
import { ProjectileShape, getCollider } from './ProjectileShapes'
import { triggerImpact } from './effects'
import { playKind } from './audio'
import { playSfx } from './sfx'

export interface ThrowSpec {
  id: number
  origin: [number, number, number]
  velocity: [number, number, number]
  kind: ProjectileKind
}

interface Props {
  throws: ThrowSpec[]
  onLanded: (id: number) => void
}

export function Projectiles({ throws, onLanded }: Props) {
  return (
    <>
      {throws.map((t) => (
        <Projectile key={t.id} spec={t} onLanded={onLanded} />
      ))}
    </>
  )
}

function Projectile({ spec, onLanded }: { spec: ThrowSpec; onLanded: (id: number) => void }) {
  const ref = useRef<RapierRigidBody>(null)
  const lifeRef = useRef(0)
  const doneRef = useRef(false)
  const registerHit = useGame((s) => s.registerHit)
  const registerDummyHit = useGame((s) => s.registerDummyHit)
  const info = KIND_INFO[spec.kind]
  const col = getCollider(spec.kind)

  useEffect(() => {
    if (!ref.current) return
    ref.current.setLinvel(
      { x: spec.velocity[0], y: spec.velocity[1], z: spec.velocity[2] },
      true,
    )
    ref.current.setAngvel(
      {
        x: (Math.random() - 0.5) * 20,
        y: (Math.random() - 0.5) * 20,
        z: (Math.random() - 0.5) * 20,
      },
      true,
    )
  }, [spec])

  useFrame((_, dt) => {
    lifeRef.current += dt
    if (lifeRef.current > 8 && !doneRef.current) {
      doneRef.current = true
      onLanded(spec.id)
    }
  })

  const handleCollision = (e: { other: { rigidBodyObject?: THREE.Object3D | null } }) => {
    if (doneRef.current) return
    const otherName = e.other.rigidBodyObject?.name
    const wp = ref.current?.translation()
    if (!wp) return

    if (otherName === WALL_NAME) {
      const localX = THREE.MathUtils.clamp(wp.x, -WALL.width / 2, WALL.width / 2)
      const localY = THREE.MathUtils.clamp(
        wp.y - WALL.y,
        -WALL.height / 2,
        WALL.height / 2,
      )
      const lv = ref.current!.linvel()
      const speed = Math.hypot(lv.x, lv.y, lv.z)
      const radius = THREE.MathUtils.clamp(
        (0.15 + speed * 0.018) * info.splatScale,
        0.2,
        1.4,
      )
      registerHit({
        x: localX,
        y: localY,
        radius,
        color: info.splatColor,
        kind: spec.kind,
        rotation: Math.random() * Math.PI * 2,
      })
      // Force normalised: ~6 m/s = light, ~40 m/s = max smash
      const force = Math.min(1, speed / 35) * (0.5 + info.damage / 16)
      triggerImpact(force)
      // Thud volume scales with impact force — gentle taps barely register, smashes hit hard
      playKind(spec.kind, 0.25 + force * 0.55)
      if (spec.kind !== 'chair') {
        doneRef.current = true
        onLanded(spec.id)
      }
    } else if (otherName === DUMMY_NAME || otherName === DUMMY_HEAD_NAME) {
      const isHead = otherName === DUMMY_HEAD_NAME
      const otherObj = e.other.rigidBodyObject as THREE.Object3D | null
      const dummyPos = otherObj ? otherObj.position : new THREE.Vector3(0, 1, -ROOM_BACK)
      const raw = new THREE.Vector3(
        wp.x - dummyPos.x,
        wp.y - dummyPos.y,
        wp.z - dummyPos.z,
      )

      // Project the contact onto the actual surface so splats sit ON the body,
      // not floating in the middle of it.
      let surfacePos = new THREE.Vector3()
      let n = new THREE.Vector3()
      if (isHead) {
        // Sphere of radius 0.42 centered at head origin
        const len = raw.length() || 1
        n.copy(raw).multiplyScalar(1 / len)
        surfacePos.copy(n).multiplyScalar(0.42)
      } else {
        // Capsule: half-height 0.5, radius 0.3 (matches CapsuleCollider)
        const halfH = 0.5
        const r = 0.3
        if (Math.abs(raw.y) <= halfH) {
          // Cylinder section — project XZ to radius r
          const xz = Math.hypot(raw.x, raw.z) || 1
          n.set(raw.x / xz, 0, raw.z / xz)
          surfacePos.set(n.x * r, raw.y, n.z * r)
        } else {
          // Hemisphere cap
          const cy = raw.y > 0 ? halfH : -halfH
          const d = new THREE.Vector3(raw.x, raw.y - cy, raw.z)
          const len = d.length() || 1
          n.copy(d).multiplyScalar(1 / len)
          surfacePos.set(n.x * r, cy + n.y * r, n.z * r)
        }
      }

      const lv = ref.current!.linvel()
      const speed = Math.hypot(lv.x, lv.y, lv.z)
      const baseR = isHead ? 0.07 + speed * 0.0045 : 0.11 + speed * 0.007
      const radius = THREE.MathUtils.clamp(
        baseR * info.splatScale,
        0.07,
        isHead ? 0.22 : 0.32,
      )
      registerDummyHit(info.damage * (isHead ? 2 : 1), {
        lx: surfacePos.x,
        ly: surfacePos.y,
        lz: surfacePos.z,
        nx: n.x,
        ny: n.y,
        nz: n.z,
        radius,
        color: info.splatColor,
        kind: spec.kind,
        rotation: Math.random() * Math.PI * 2,
        onHead: isHead,
      })
      // Dummy hits feel chunkier than wall hits — bonus force
      const force = Math.min(1, speed / 32) * (0.6 + info.damage / 14) * (isHead ? 1.2 : 1)
      triggerImpact(force)
      playKind(spec.kind, 0.3 + force * 0.6)
      // Chunky body-impact layer on top of the per-kind thud.
      playSfx('hitDummy', { volume: 0.25 + force * 0.4 })
      if (spec.kind !== 'chair' && spec.kind !== 'tv') {
        doneRef.current = true
        onLanded(spec.id)
      }
    }
  }

  return (
    <RigidBody
      ref={ref}
      position={spec.origin}
      colliders={false}
      mass={info.mass}
      restitution={spec.kind === 'rock' ? 0.45 : 0.2}
      friction={0.7}
      linearDamping={0.08}
      angularDamping={0.2}
      ccd
      onCollisionEnter={handleCollision}
    >
      {col.type === 'ball' ? (
        <BallCollider args={[col.radius]} />
      ) : (
        <CuboidCollider args={col.half} />
      )}
      <ProjectileShape kind={spec.kind} />
    </RigidBody>
  )
}
