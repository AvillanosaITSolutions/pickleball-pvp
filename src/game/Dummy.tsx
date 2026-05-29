import { useRef, useEffect, useMemo, useState } from 'react'
import { RigidBody, CapsuleCollider, BallCollider } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame, type DummySplat } from './store'
import { ROOM } from './constants'
import { SplatMark3D } from './SplatMark3D'
import { dummyState } from './dummyState'
import { useLoadedTexture } from './useLoadedTexture'

export const DUMMY_NAME = 'dummyBody'
export const DUMMY_HEAD_NAME = 'dummyHead'

const SPAWN: [number, number, number] = [0, 0.45, -ROOM.depth / 2 + 1.8]
const STICK_COLOR = '#f59e0b'

export function Dummy({ photoUrl }: { photoUrl?: string | null }) {
  // Prefer the dedicated dummy face photo; fall back to the wall photo
  const storedPhotoUrl = useGame((s) => s.dummyPhotoUrl ?? s.photoUrl)
  const effectiveUrl = photoUrl ?? storedPhotoUrl
  const dummyHits = useGame((s) => s.dummyHits)
  const dummySplats = useGame((s) => s.dummySplats)
  const clearDummySplats = useGame((s) => s.clearDummySplats)

  const bodyRef = useRef<RapierRigidBody>(null)
  const headRef = useRef<RapierRigidBody>(null)
  const flinchRef = useRef(0)
  const groupRef = useRef<THREE.Group>(null)
  const lastHits = useRef(dummyHits)

  const faceTex = useLoadedTexture(effectiveUrl)

  // Trigger flinch when hits count changes
  useEffect(() => {
    if (dummyHits > lastHits.current) {
      flinchRef.current = 0.35
    }
    lastHits.current = dummyHits
  }, [dummyHits])

  // Reset position if dummy gets knocked too far away or falls over
  useFrame((_, dt) => {
    flinchRef.current = Math.max(0, flinchRef.current - dt)

    if (bodyRef.current) {
      const p = bodyRef.current.translation()
      const dist = Math.hypot(p.x - SPAWN[0], p.z - SPAWN[2])
      if (dist > 2.5 || p.y < 0.2 || p.y > 3) {
        bodyRef.current.setTranslation({ x: SPAWN[0], y: SPAWN[1], z: SPAWN[2] }, true)
        bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
        bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
        bodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
        clearDummySplats()
      }
    }
    if (headRef.current && bodyRef.current) {
      const p = bodyRef.current.translation()
      headRef.current.setNextKinematicTranslation({
        x: p.x,
        y: p.y + 0.85, // raised slightly so the bigger head sits on top of body
        z: p.z,
      })
      dummyState.bodyPos.set(p.x, p.y, p.z)
      dummyState.headPos.set(p.x, p.y + 0.85, p.z)
      // Track rapier handles so the gun raycast can skip dummy bodies and let
      // the manual dummy raycasts (head sphere + body capsule) handle splats.
      if (dummyState.bodyHandle !== bodyRef.current.handle) {
        dummyState.bodyHandle = bodyRef.current.handle
      }
      if (dummyState.headHandle !== headRef.current.handle) {
        dummyState.headHandle = headRef.current.handle
      }
    }
    if (groupRef.current) {
      // Visual flinch: small recoil
      const f = flinchRef.current / 0.35
      groupRef.current.position.z = Math.sin(f * Math.PI) * 0.08
    }
  })

  return (
    <group>
      {/* Body — dynamic capsule that gets knocked around */}
      <RigidBody
        ref={bodyRef}
        position={SPAWN}
        colliders={false}
        mass={5}
        linearDamping={1.5}
        angularDamping={2.0}
        friction={0.8}
        restitution={0.1}
        enabledRotations={[false, false, false]} // upright
        name={DUMMY_NAME}
      >
        <CapsuleCollider args={[0.2, 0.8]} />
        <group ref={groupRef}>
          {/* Torso */}
          <mesh castShadow position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.9, 8]} />
            <meshStandardMaterial color={STICK_COLOR} roughness={0.7} />
          </mesh>
          {/* Arms */}
          <mesh position={[0, 0.8, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
            <meshStandardMaterial color={STICK_COLOR} roughness={0.7} />
          </mesh>
          {/* Legs */}
          <mesh position={[-0.1, -0.15, 0]} rotation={[0, 0, 0.45]}>
            <cylinderGeometry args={[0.04, 0.04, 0.55, 8]} />
            <meshStandardMaterial color={STICK_COLOR} roughness={0.7} />
          </mesh>
          <mesh position={[0.1, -0.15, 0]} rotation={[0, 0, -0.45]}>
            <cylinderGeometry args={[0.04, 0.04, 0.55, 8]} />
            <meshStandardMaterial color={STICK_COLOR} roughness={0.7} />
          </mesh>
          {/* Neck joint */}
          <mesh position={[0, 0.95, 0]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial color={STICK_COLOR} roughness={0.7} />
          </mesh>
        </group>
      </RigidBody>

      {/* Head — kinematic so it stays on top, but still collidable */}
      <RigidBody
        ref={headRef}
        position={[SPAWN[0], SPAWN[1] + 0.75, SPAWN[2]]}
        type="kinematicPosition"
        colliders={false}
        name={DUMMY_HEAD_NAME}
      >
        <BallCollider args={[0.42]} />
        <Head faceTex={faceTex} faceSplats={dummySplats.filter((s) => s.onHead)} />
        {dummySplats
          .filter((s) => s.onHead)
          .map((s, i) => (
            <SplatMark3D key={s.id} splat={s} layer={i} />
          ))}
      </RigidBody>
    </group>
  )
}

function Head({ faceTex, faceSplats }: { faceTex: THREE.Texture | null; faceSplats: DummySplat[] }) {
  const [faceMap, setFaceMap] = useState<THREE.CanvasTexture | null>(null)

  useEffect(() => {
    const texture = createFaceTexture(
      (faceTex?.image as TexImageSource | undefined) ?? null,
      faceSplats,
    )
    // CanvasTexture defaults to flipY=true so DOM-origin pixels (top-left)
    // map correctly to UV origin (bottom-left in three.js convention).
    // Leaving it true keeps the photo upright on the dummy's face.
    texture.flipY = true
    texture.needsUpdate = true
    setFaceMap(texture)
    return () => texture.dispose()
  }, [faceTex?.image, faceSplats])

  return (
    <group>
      {/* Skull */}
      <mesh castShadow>
        <sphereGeometry args={[0.42, 24, 24]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.7} />
      </mesh>
      {/* Face panel (the uploaded photo) — sits just in front of the larger sphere */}
      <mesh position={[0, 0, 0.43]} renderOrder={1}>
        <planeGeometry args={[0.62, 0.62]} />
        <meshStandardMaterial
          map={faceMap ?? undefined}
          toneMapped={false}
          side={THREE.DoubleSide}
          transparent
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {faceSplats.map((splat) => (
        <FaceSplat key={splat.id} splat={splat} />
      ))}
    </group>
  )
}

function FaceSplat({ splat }: { splat: DummySplat }) {
  const { drips, blobRadius } = useMemo(() => {
    const r = rng(splat.id * 9831 + 27491)
    const dripCount = 2 + Math.floor(r() * 3)
    const drips = Array.from({ length: dripCount }, () => ({
      x: (r() - 0.5) * splat.radius * 0.8,
      y: -splat.radius * (0.5 + r() * 0.8),
      length: splat.radius * (0.4 + r() * 0.9),
      width: splat.radius * (0.06 + r() * 0.12),
      opacity: 0.5 + r() * 0.3,
    }))
    return { drips, blobRadius: splat.radius * (0.5 + r() * 0.25), opacity: 0.75 + r() * 0.2 }
  }, [splat.id, splat.radius])

  if (splat.lz <= 0.05) return null

  return (
    <group position={[splat.lx, splat.ly, 0.312]} rotation={[0, 0, splat.rotation]} renderOrder={2}>
      <mesh position={[0, 0, 0]}>
        <circleGeometry args={[splat.radius * 0.95, 20]} />
        <meshBasicMaterial color={splat.color} transparent opacity={0.9} />
      </mesh>
      {drips.map((drip, index) => (
        <mesh key={index} position={[drip.x, drip.y - drip.length / 2, 0.0001]}>
          <planeGeometry args={[drip.width, drip.length]} />
          <meshBasicMaterial color={splat.color} transparent opacity={drip.opacity} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.0002]}>
        <circleGeometry args={[blobRadius, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.18} />
      </mesh>
    </group>
  )
}

function createFaceTexture(image: TexImageSource | null | undefined, faceSplats: DummySplat[]) {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return new THREE.CanvasTexture(canvas)
  }

  if (image) {
    try {
      ctx.drawImage(image as CanvasImageSource, 0, 0, size, size)
    } catch {
      ctx.fillStyle = '#fde68a'
      ctx.fillRect(0, 0, size, size)
    }
  } else {
    ctx.fillStyle = '#fde68a'
    ctx.fillRect(0, 0, size, size)
  }

  const scale = size / 0.38
  faceSplats.forEach((splat) => {
    if (splat.lz <= 0.05) return
    const u = 0.5 + splat.lx / 0.38
    const v = 0.5 - splat.ly / 0.38
    const x = u * size
    const y = v * size
    const r = Math.max(4, splat.radius * scale)

    ctx.fillStyle = splat.color
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.arc(x, y, r * 0.95, 0, Math.PI * 2)
    ctx.fill()

    const dripCount = 3
    for (let i = 0; i < dripCount; i += 1) {
      const angle = Math.PI * 0.25 + (i / dripCount) * Math.PI * 0.5
      const dx = Math.cos(angle) * r * 0.4
      const dy = Math.sin(angle) * r * 1.2
      ctx.beginPath()
      ctx.ellipse(x + dx, y + dy, r * 0.2, r * 0.55, angle, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(1, r * 0.08)
    ctx.beginPath()
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2)
    ctx.stroke()
  })

  return new THREE.CanvasTexture(canvas)
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}
