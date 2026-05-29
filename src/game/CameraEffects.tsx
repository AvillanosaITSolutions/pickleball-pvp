import { useFrame, useThree } from '@react-three/fiber'
import { effects, tickEffects } from './effects'
import { useGame } from './store'

/**
 * Applies trauma-based screen shake to the camera. Position-only shake — we
 * additively offset camera.position each frame.
 *
 * IMPORTANT: this useFrame is mounted AFTER Player's, so Player's useFrame
 * runs first and writes the fresh camera.position from its movement state.
 * We then add shake on top. Next frame, Player overwrites position again
 * (resetting our shake) before we add a new shake offset. No restore needed.
 *
 * Rotation shake is intentionally skipped: PointerLockControls only updates
 * camera.quaternion on mousemove, so adding shake to quaternion would drift
 * between mouse movements. Position shake alone reads as plenty punchy.
 */
export function CameraEffects() {
  const { camera } = useThree()
  const sessionActive = useGame((s) => s.sessionActive)

  useFrame((_, dt) => {
    tickEffects(dt)

    if (!sessionActive) return

    const trauma = effects.trauma
    if (trauma < 0.01) return

    // Nonlinear ramp — small trauma = small shake, big trauma = chunky shake.
    // Movement is unaffected because Player overwrites camera.position at the
    // start of every frame — our shake is purely additive visual jitter.
    const shake = trauma * trauma
    const t = performance.now() * 0.001

    camera.position.x += (noise(t * 30) - 0.5) * shake * 0.16
    camera.position.y += (noise(t * 30 + 100) - 0.5) * shake * 0.08
    camera.position.z += (noise(t * 30 + 200) - 0.5) * shake * 0.10
  })

  return null
}

// Cheap pseudo-noise; doesn't need to be good
function noise(x: number) {
  return Math.abs(Math.sin(x) + Math.sin(x * 1.7 + 0.5) * 0.5) % 1
}
