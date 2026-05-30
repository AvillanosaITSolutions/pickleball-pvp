// Time-based access packs in Philippine Pesos.
// Players buy hours of rage-room time, not per-throw credits.
// Time decrements while the player is actively in the 3D scene (pointer locked).

export interface TimePack {
  id: string
  pesos: number
  hours: number
  label: string
  popular?: boolean
}

export const TIME_PACKS: TimePack[] = [
  { id: 'starter',  pesos: 30,  hours: 5,   label: 'Quick Rage' },
  { id: 'casual',   pesos: 75,  hours: 12,  label: 'Session', popular: true },
  { id: 'angry',    pesos: 150, hours: 28,  label: 'All Day' },
  { id: 'furious',  pesos: 300, hours: 60,  label: 'Weeklong Vendetta' },
  { id: 'unhinged', pesos: 500, hours: 110, label: 'Monthly Outrage' },
]

export function pesosToMs(pesos: number) {
  const exact = TIME_PACKS.find((p) => p.pesos === pesos)
  if (exact) return exact.hours * 3600_000
  // Fallback rate: ₱6/hour
  return Math.floor((pesos / 6) * 3600_000)
}

/** Format ms as "Xh Ym" or "Xm Ys" or "Xs" */
export function formatTime(ms: number): string {
  if (ms <= 0) return '0s'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export const FREE_TRIAL_MS = 3 * 60_000 // 3 minutes free on first visit

// Daily login streak grants bonus free time, capped per day. Encourages return visits.
export const STREAK_BONUS_MS = 30_000
export const STREAK_BONUS_CAP_DAYS = 14
