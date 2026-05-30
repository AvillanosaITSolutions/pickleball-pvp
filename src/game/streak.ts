import { STREAK_BONUS_CAP_DAYS, STREAK_BONUS_MS } from './pricing'

// Daily login streak. On each new calendar day, grant bonus free time scaled by
// streak length (capped). Returns the amount granted this call (0 if same day).
//
// Storage: `streakLastDay` (YYYY-MM-DD) and `streakCount`. Missing a day resets.

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00')
  const db = new Date(b + 'T00:00:00')
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}

export interface StreakResult {
  bonusMs: number
  streak: number
  isNewDay: boolean
}

export function checkInStreak(): StreakResult {
  const today = todayKey()
  let last: string | null = null
  let count = 0
  try {
    last = localStorage.getItem('streakLastDay')
    count = parseInt(localStorage.getItem('streakCount') || '0', 10) || 0
  } catch {}

  if (last === today) return { bonusMs: 0, streak: count, isNewDay: false }

  const gap = last ? daysBetween(last, today) : 1
  const nextStreak = gap === 1 ? count + 1 : 1
  const scaled = Math.min(nextStreak, STREAK_BONUS_CAP_DAYS)
  const bonusMs = STREAK_BONUS_MS * scaled

  try {
    localStorage.setItem('streakLastDay', today)
    localStorage.setItem('streakCount', String(nextStreak))
  } catch {}

  return { bonusMs, streak: nextStreak, isNewDay: true }
}

export function getStreak(): number {
  try { return parseInt(localStorage.getItem('streakCount') || '0', 10) || 0 } catch { return 0 }
}
