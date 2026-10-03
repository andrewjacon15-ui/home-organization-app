/** Kitchen timer state and how it moves on with the clock (pure, so it's easy to test). */

export type TimerState = 'ready' | 'running' | 'paused' | 'ringing' | 'done'

export interface KitchenTimer {
  id: string
  label: string
  /** The length it was set for, in seconds. */
  total: number
  state: TimerState
  /** When it goes off (running), else null. */
  endsAt: number | null
  /** Time left while ready or paused, in ms. */
  leftMs: number
  /** When it started ringing. */
  rangAt?: number
  /** Where it came from ("recipe-id#step-3"), so a step doesn't spawn the same timer twice. */
  source?: string
}

/** A forgotten alarm goes quiet after this long (the timer still shows as done). */
export const RING_LIMIT_MS = 15 * 60_000

export const timeLeft = (t: KitchenTimer, now: number) => (t.state === 'running' && t.endsAt != null ? Math.max(0, t.endsAt - now) : t.leftMs)

/** Running timers whose time is up start ringing; long-ringing ones go quiet. */
export function advance(timers: KitchenTimer[], now: number): KitchenTimer[] {
  let changed = false
  const next = timers.map((t) => {
    if (t.state === 'running' && t.endsAt != null && t.endsAt <= now) {
      changed = true
      return { ...t, state: 'ringing' as const, endsAt: null, leftMs: 0, rangAt: t.endsAt }
    }
    if (t.state === 'ringing' && t.rangAt != null && now - t.rangAt > RING_LIMIT_MS) {
      changed = true
      return { ...t, state: 'done' as const }
    }
    return t
  })
  return changed ? next : timers
}

