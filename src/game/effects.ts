// Module-scope state for shake / slow-mo / dummy reactions.
// Read every frame from useFrame hooks, written from collision handlers.
// Kept out of React state so we don't re-render on every frame.

export interface EffectsState {
  // Camera-shake trauma 0..1. Decays at ~3 units/sec. Applied as random offset
  // scaled by trauma^2 for that punchy nonlinear ramp.
  trauma: number
  // Time-scale 0..1. 1 = normal, 0.2 = bullet time. Recovers toward 1.
  timeScale: number
  // How long slow-mo holds before recovering (seconds).
  slowMoUntil: number
  // Last-impact magnitude for visualisations (rage bar pulse, etc).
  lastImpactForce: number
  // Dummy: last-hit timestamp + cumulative recoil offset (z-direction punch).
  dummyHitFlashUntil: number
  dummyKnockback: number
}

export const effects: EffectsState = {
  trauma: 0,
  timeScale: 1,
  slowMoUntil: 0,
  lastImpactForce: 0,
  dummyHitFlashUntil: 0,
  dummyKnockback: 0,
}

/**
 * Trigger feedback for an impact. `force` is normalised 0..1 where 1 is a max-power
 * smash. Bigger hits ⇒ more shake + longer slow-mo + bigger flash.
 */
export function triggerImpact(force: number) {
  const f = Math.max(0, Math.min(1, force))
  // Quadratic ramp: tiny shots barely register; big smashes go HARD.
  const add = 0.06 + f * f * 0.75
  effects.trauma = Math.min(1, effects.trauma + add)
  effects.lastImpactForce = f
  effects.dummyHitFlashUntil = performance.now() + 250
  effects.dummyKnockback = Math.min(0.25, effects.dummyKnockback + 0.05 + f * 0.12)

  if (f > 0.55) {
    const dur = 100 + f * 240
    effects.slowMoUntil = performance.now() + dur
    effects.timeScale = 0.25 + (1 - f) * 0.3
  }
}

/** Step effect state each frame; called by Game's useFrame. */
export function tickEffects(dt: number) {
  // 2.5/s decay: heavy smashes linger as visible aftershake (~0.4s);
  // light hits fade fast enough that rapid fire doesn't sustain a shake.
  effects.trauma = Math.max(0, effects.trauma - dt * 2.5)
  if (performance.now() > effects.slowMoUntil) {
    effects.timeScale = Math.min(1, effects.timeScale + dt * 2.5)
  }
  effects.dummyKnockback = Math.max(0, effects.dummyKnockback - dt * 0.6)
}
