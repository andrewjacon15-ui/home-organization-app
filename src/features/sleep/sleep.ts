/** Minutes since midnight for "HH:MM". */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Whether `now` falls in the from→to window, which may run past midnight (21:00 → 06:00). */
export function inSleepWindow(now: Date, from: string, to: string): boolean {
  const t = now.getHours() * 60 + now.getMinutes()
  const a = toMinutes(from)
  const b = toMinutes(to)
  if (a === b) return false
  return a < b ? t >= a && t < b : t >= a || t < b
}

export const WAKE_IDLE_MS = 2 * 60 * 1000

export interface SleepState {
  /** Asleep by schedule unless someone woke it recently. */
  scheduled: boolean
  /** "Enter Sleep Mode Now" was pressed (until the next tap). */
  manual: boolean
  lastActivity: number
}

/** Asleep when put to sleep by hand, or in the scheduled window and idle for 2 minutes. */
export function isAsleep(s: SleepState, now: number): boolean {
  if (s.manual) return true
  return s.scheduled && now - s.lastActivity >= WAKE_IDLE_MS
}

/** "9:00 PM" for "21:00". */
export function formatHHMM(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
