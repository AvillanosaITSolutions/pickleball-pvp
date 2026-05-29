import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { PLAYER, PROJECTILE, ROOM } from './constants'
import { useGame, KIND_INFO } from './store'
import type { ThrowSpec } from './Projectiles'
import { ProjectileShape } from './ProjectileShapes'
import { dummyState, fireFlash } from './dummyState'
import { triggerImpact } from './effects'
import { WALL } from './constants'
import { playKind } from './audio'
import { breakRegistry } from './Props'
import { useWorldSplats } from './WorldSplats'
import { emitPose, emitThrow, emitWorldSplat } from './net'

// Convenient wrapper so we can call addWorldSplat() without subscribing
const addWorldSplat = (s: Parameters<ReturnType<typeof useWorldSplats.getState>['add']>[0]) =>
  useWorldSplats.getState().add(s)

interface Props {
  onThrow: (spec: ThrowSpec) => void
}

const keys = { w: false, a: false, s: false, d: false }
let throwId = 1

export function Player({ onThrow }: Props) {
  const { camera } = useThree()
  const { rapier, world } = useRapier()
  const handRef = useRef<THREE.Group>(null)
  const posRef = useRef(new THREE.Vector3(0, PLAYER.eyeHeight, PLAYER.startZ))
  const chargeRef = useRef<{ active: boolean; t: number }>({ active: false, t: 0 })
  const vyRef = useRef(0)
  const groundedRef = useRef(true)
  const fireHeldRef = useRef(false)
  // Head-bob: phase advances while moving; idle slowly recovers
  const bobPhaseRef = useRef(0)
  const bobAmpRef = useRef(0)
  const lastFireRef = useRef(0)
  const stretchAudioRef = useRef<HTMLAudioElement | null>(null)
  const lastPoseEmitRef = useRef(0)

  function getStretch() {
    if (!stretchAudioRef.current) {
      const a = new Audio('/audio/stretch.mp3')
      a.preload = 'auto'
      a.volume = 0
      stretchAudioRef.current = a
    }
    return stretchAudioRef.current
  }
  function startStretch() {
    const a = getStretch()
    try {
      a.currentTime = 0
      a.volume = 0.5
      a.play().catch(() => {})
    } catch {}
  }
  function stopStretch() {
    const a = stretchAudioRef.current
    if (!a) return
    try {
      a.pause()
      a.currentTime = 0
    } catch {}
  }

  const setCharge = useGame((s) => s.setCharge)
  const registerThrow = useGame((s) => s.registerThrow)
  const registerHit = useGame((s) => s.registerHit)
  const registerDummyHit = useGame((s) => s.registerDummyHit)
  const selectedKind = useGame((s) => s.selectedKind)
  const selectedKindRef = useRef(selectedKind)
  useEffect(() => {
    selectedKindRef.current = selectedKind
  }, [selectedKind])

  useEffect(() => {
    camera.position.copy(posRef.current)
    camera.lookAt(0, 1.5, 0)

    const kdown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k in keys) (keys as any)[k] = true
      if (e.code === 'Space') {
        e.preventDefault()
        if (groundedRef.current) {
          vyRef.current = 5.2
          groundedRef.current = false
        }
      }
    }
    const kup = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k in keys) (keys as any)[k] = false
    }
    const mdown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (document.pointerLockElement === null) return
      if (selectedKindRef.current === 'gun') {
        fireHeldRef.current = true
        tryFireGun()
      } else {
        chargeRef.current.active = true
        chargeRef.current.t = 0
        startStretch()
      }
    }
    const mup = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (selectedKindRef.current === 'gun') {
        fireHeldRef.current = false
        return
      }
      if (!chargeRef.current.active) return
      const t = chargeRef.current.t
      chargeRef.current.active = false
      stopStretch()
      const p = THREE.MathUtils.clamp(t / PROJECTILE.chargeTime, 0.1, 1)
      throwProjectile(p)
    }
    window.addEventListener('keydown', kdown)
    window.addEventListener('keyup', kup)
    window.addEventListener('mousedown', mdown)
    window.addEventListener('mouseup', mup)
    // If pointer lock is dropped mid-charge (e.g. user pressed Esc), cancel
    // the charge cleanly so the stretch sound doesn't keep playing.
    const onLockChange = () => {
      if (document.pointerLockElement === null && chargeRef.current.active) {
        chargeRef.current.active = false
        stopStretch()
      }
    }
    document.addEventListener('pointerlockchange', onLockChange)
    return () => {
      window.removeEventListener('keydown', kdown)
      window.removeEventListener('keyup', kup)
      window.removeEventListener('mousedown', mdown)
      window.removeEventListener('mouseup', mup)
      document.removeEventListener('pointerlockchange', onLockChange)
      stopStretch()
    }
  }, [camera])

  function tryFireGun() {
    const now = performance.now()
    if (now - lastFireRef.current < 130) return // ~7.7 shots/sec auto-fire
    if (!useGame.getState().hasTime()) return // out of paid time
    lastFireRef.current = now
    // Auto-fire is rapid — lower per-shot volume so it doesn't crush the mix
    playKind('gun', 0.35)
    fireGun()
  }

  function fireGun() {
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir).normalize()
    const origin = camera.position.clone()

    type Hit = {
      t: number
      target: 'wall' | 'body' | 'head'
      point: THREE.Vector3
      normal: THREE.Vector3
    }
    const hits: Hit[] = []

    // Wall: plane z = WALL.z + 0.11 (the visible photo plane), bounded by ROOM
    if (dir.z < -0.001) {
      const wallZ = WALL.z + 0.11
      const t = (wallZ - origin.z) / dir.z
      if (t > 0) {
        const p = origin.clone().addScaledVector(dir, t)
        // Use full back-wall extent (so bullets can hit outside the photo too)
        if (Math.abs(p.x) < 6 && p.y > 0.05 && p.y < 5) {
          hits.push({
            t,
            target: 'wall',
            point: p,
            normal: new THREE.Vector3(0, 0, 1),
          })
        }
      }
    }

    // Dummy head: sphere at headPos, radius 0.28
    const headHit = raySphere(origin, dir, dummyState.headPos, 0.42)
    if (headHit) {
      hits.push({
        t: headHit.t,
        target: 'head',
        point: headHit.point,
        normal: headHit.normal,
      })
    }

    // Dummy body: capsule at bodyPos, halfHeight 0.5, radius 0.3 (aligned with Y)
    const bodyHit = rayCapsuleY(origin, dir, dummyState.bodyPos, 0.5, 0.3)
    if (bodyHit) {
      hits.push({
        t: bodyHit.t,
        target: 'body',
        point: bodyHit.point,
        normal: bodyHit.normal,
      })
    }

    // Physics raycast: hits any rigid body (props, breakables, knockable junk).
    // We SKIP dummy bodies here — they have their own manual raycasts above
    // that produce splatters. Without this skip, the rapier hit would short-
    // circuit the splat code below.
    let propHitT = Infinity
    let propCollider: unknown = null
    let propRb: { handle: number; applyImpulse: (i: { x: number; y: number; z: number }, w: boolean) => void } | null = null
    try {
      const ray = new rapier.Ray(
        { x: origin.x, y: origin.y, z: origin.z },
        { x: dir.x, y: dir.y, z: dir.z },
      )
      const result = world.castRay(ray, 50, true)
      if (result) {
        const collider = result.collider as { parent?: () => typeof propRb }
        const rb = collider.parent?.() ?? null
        const isDummy =
          rb !== null &&
          (rb.handle === dummyState.bodyHandle ||
            rb.handle === dummyState.headHandle)
        if (!isDummy) {
          propHitT = result.timeOfImpact
          propCollider = result.collider
          propRb = rb
        }
      }
    } catch {
      // rapier ray API mismatch in some versions — silently skip
    }

    hits.sort((a, b) => a.t - b.t)
    const hit = hits[0]
    const propIsClosest = propCollider && propHitT < (hit?.t ?? Infinity)

    fireFlash.until = performance.now() + 70

    if (propIsClosest && propRb) {
      const isBreakable = breakRegistry.has(propRb.handle)
      // Hit point + outward normal (negative bullet direction)
      const hitPoint = origin.clone().addScaledVector(dir, propHitT)
      const splat = {
        x: hitPoint.x,
        y: hitPoint.y,
        z: hitPoint.z,
        nx: -dir.x,
        ny: -dir.y,
        nz: -dir.z,
        color: '#0a0a0a',
        radius: 0.045,
        style: 'bullet' as const,
        seed: Math.floor(Math.random() * 1e9),
      }
      addWorldSplat(splat)
      emitWorldSplat(splat)
      if (isBreakable) {
        propRb.applyImpulse({ x: dir.x * 1.5, y: dir.y * 1.5 + 0.4, z: dir.z * 1.5 }, true)
        breakRegistry.get(propRb.handle)!()
        triggerImpact(0.18)
      } else {
        // Tiny tap on non-glass so things don't get blasted across the room
        propRb.applyImpulse({ x: dir.x * 0.25, y: dir.y * 0.25 + 0.05, z: dir.z * 0.25 }, true)
        triggerImpact(0.08)
      }
      return
    }

    if (!hit) return

    const info = KIND_INFO.gun

    if (hit.target === 'wall') {
      const localX = THREE.MathUtils.clamp(
        hit.point.x,
        -WALL.width / 2,
        WALL.width / 2,
      )
      const localY = THREE.MathUtils.clamp(
        hit.point.y - WALL.y,
        -WALL.height / 2,
        WALL.height / 2,
      )
      registerHit({
        x: localX,
        y: localY,
        radius: 0.04,
        color: info.splatColor,
        kind: 'gun',
        rotation: Math.random() * Math.PI * 2,
      })
      triggerImpact(0.08) // gun chatter — tiny per-shot shake
    } else {
      const isHead = hit.target === 'head'
      const dummyPos = isHead ? dummyState.headPos : dummyState.bodyPos
      const local = hit.point.clone().sub(dummyPos)
      registerDummyHit(info.damage * (isHead ? 2 : 1), {
        lx: local.x,
        ly: local.y,
        lz: local.z,
        nx: hit.normal.x,
        ny: hit.normal.y,
        nz: hit.normal.z,
        radius: isHead ? 0.035 : 0.045,
        color: info.splatColor,
        kind: 'gun',
        rotation: Math.random() * Math.PI * 2,
        onHead: isHead,
      })
      triggerImpact(isHead ? 0.2 : 0.12)
    }
  }

  function throwProjectile(power: number) {
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir).normalize()
    // Spawn just in front of camera so it doesn't immediately collide
    const origin = new THREE.Vector3()
      .copy(camera.position)
      .addScaledVector(dir, 0.6)
      // Drop a little so it comes from "hand" not face
      .add(new THREE.Vector3(0, -0.2, 0))

    const speed = THREE.MathUtils.lerp(PROJECTILE.minPower, PROJECTILE.maxPower, power)
    // Small upward bias for arc; less bias at higher power
    const lift = (1 - power) * 1.5
    const velocity = new THREE.Vector3(
      dir.x * speed,
      dir.y * speed + lift,
      dir.z * speed,
    )

    const kind = selectedKindRef.current
    if (!useGame.getState().hasTime()) return // out of paid time
    // No throw-time sound — the thud plays on impact (Projectiles.handleCollision)
    const spec = {
      id: throwId++,
      origin: [origin.x, origin.y, origin.z] as [number, number, number],
      velocity: [velocity.x, velocity.y, velocity.z] as [number, number, number],
      kind,
    }
    onThrow(spec)
    emitThrow(spec)
    registerThrow()
  }

  useFrame((_, dt) => {
    // Movement
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0))
    const move = new THREE.Vector3()
    if (keys.w) move.add(forward)
    if (keys.s) move.sub(forward)
    if (keys.d) move.add(right)
    if (keys.a) move.sub(right)
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(PLAYER.speed * dt)
      posRef.current.add(move)
    }

    const hw = ROOM.width / 2 - 0.5
    const hd = ROOM.depth / 2 - 0.5
    posRef.current.x = THREE.MathUtils.clamp(posRef.current.x, -hw, hw)
    posRef.current.z = THREE.MathUtils.clamp(posRef.current.z, -hd + 4, hd)

    // Jump physics
    vyRef.current -= 9.81 * dt * 2 // beefed-up gravity feels snappier than realistic
    posRef.current.y += vyRef.current * dt
    if (posRef.current.y <= PLAYER.eyeHeight) {
      posRef.current.y = PLAYER.eyeHeight
      vyRef.current = 0
      groundedRef.current = true
    }
    camera.position.copy(posRef.current)

    // Emit our pose to multiplayer peers ~10Hz
    const nowMs = performance.now()
    if (nowMs - lastPoseEmitRef.current > 100) {
      lastPoseEmitRef.current = nowMs
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
      emitPose(posRef.current.x, posRef.current.y, posRef.current.z, euler.y, selectedKindRef.current)
    }

    // ===== Head-bob =====
    // Only bob when grounded AND actively moving horizontally.
    const moving = move.lengthSq() > 0 && groundedRef.current
    // Ramp amplitude up/down so starts/stops are smooth (no instant jolt)
    const ampTarget = moving ? 1 : 0
    bobAmpRef.current += (ampTarget - bobAmpRef.current) * Math.min(1, dt * 8)
    // Phase: 2 full steps per 1.2s ≈ a brisk walking cadence
    bobPhaseRef.current += dt * (moving ? 10 : 0)
    const amp = bobAmpRef.current
    if (amp > 0.005) {
      // Classic figure-8: y oscillates 2× per cycle, x once
      const bobY = Math.sin(bobPhaseRef.current * 2) * 0.05 * amp
      const bobX = Math.cos(bobPhaseRef.current) * 0.03 * amp
      camera.position.y += bobY
      camera.position.x += bobX
    }

    // Continuous fire while LMB held + gun selected
    if (fireHeldRef.current && selectedKindRef.current === 'gun') {
      tryFireGun()
    }

    // Hand / projectile-in-hand visual
    if (handRef.current) {
      const offset = new THREE.Vector3(0.28, -0.22, -0.45)
      offset.applyQuaternion(camera.quaternion)
      handRef.current.position.copy(camera.position).add(offset)
      handRef.current.quaternion.copy(camera.quaternion)

      if (chargeRef.current.active && selectedKindRef.current !== 'gun') {
        chargeRef.current.t += dt
        const c = THREE.MathUtils.clamp(chargeRef.current.t / PROJECTILE.chargeTime, 0, 1)
        setCharge(c)
        const pull = c * 0.35
        handRef.current.translateZ(pull)
        // Modulate stretch sound — volume swells, playback rate climbs as it strains
        const a = stretchAudioRef.current
        if (a) {
          a.volume = 0.25 + c * 0.55
          a.playbackRate = 0.9 + c * 0.5
        }
      } else {
        setCharge(0)
      }

      // Tiny recoil kick when gun fires
      if (selectedKindRef.current === 'gun') {
        const sinceFire = performance.now() - lastFireRef.current
        if (sinceFire < 90) {
          const k = 1 - sinceFire / 90
          handRef.current.translateZ(k * 0.04)
          handRef.current.rotateX(-k * 0.18)
        }
      }
    }
  })

  return (
    <>
      <PointerLockControls />
      <HeldItem ref={handRef} />
    </>
  )
}

function raySphere(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
): { t: number; point: THREE.Vector3; normal: THREE.Vector3 } | null {
  const oc = new THREE.Vector3().subVectors(origin, center)
  const b = oc.dot(dir)
  const c = oc.dot(oc) - radius * radius
  const disc = b * b - c
  if (disc < 0) return null
  const sq = Math.sqrt(disc)
  const t = -b - sq
  if (t < 0) return null
  const point = origin.clone().addScaledVector(dir, t)
  const normal = point.clone().sub(center).normalize()
  return { t, point, normal }
}

// Capsule with vertical axis (Y) — segment from center-(0,h,0) to center+(0,h,0), radius r.
function rayCapsuleY(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  center: THREE.Vector3,
  halfH: number,
  r: number,
): { t: number; point: THREE.Vector3; normal: THREE.Vector3 } | null {
  let best: { t: number; point: THREE.Vector3; normal: THREE.Vector3 } | null = null
  // Cylinder body (infinite). Solve in XZ plane: ignore Y.
  const ox = origin.x - center.x
  const oz = origin.z - center.z
  const dx = dir.x
  const dz = dir.z
  const A = dx * dx + dz * dz
  if (A > 1e-6) {
    const B = ox * dx + oz * dz
    const C = ox * ox + oz * oz - r * r
    const disc = B * B - A * C
    if (disc >= 0) {
      const sq = Math.sqrt(disc)
      const t = (-B - sq) / A
      if (t > 0) {
        const py = origin.y + dir.y * t
        const localY = py - center.y
        if (localY >= -halfH && localY <= halfH) {
          const point = origin.clone().addScaledVector(dir, t)
          const normal = new THREE.Vector3(
            point.x - center.x,
            0,
            point.z - center.z,
          ).normalize()
          best = { t, point, normal }
        }
      }
    }
  }
  // Hemisphere caps (top + bottom)
  for (const cy of [-halfH, halfH]) {
    const capCenter = new THREE.Vector3(center.x, center.y + cy, center.z)
    const hit = raySphere(origin, dir, capCenter, r)
    if (hit) {
      // Only count the part of the sphere that's outside the cylinder bounds
      const localY = hit.point.y - center.y
      if ((cy > 0 && localY >= halfH) || (cy < 0 && localY <= -halfH)) {
        if (!best || hit.t < best.t) best = hit
      }
    }
  }
  return best
}

import { forwardRef } from 'react'
const HeldItem = forwardRef<THREE.Group>((_, ref) => {
  const selectedKind = useGame((s) => s.selectedKind)
  // Scale large items so they fit in hand without blocking the view
  const scale =
    selectedKind === 'chair' ? 0.45 : selectedKind === 'tv' ? 0.5 : 1
  return (
    <group ref={ref} scale={scale}>
      <ProjectileShape kind={selectedKind} />
    </group>
  )
})
