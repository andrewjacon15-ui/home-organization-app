/**
 * Kitchen timer helpers: suggested times, clock formatting, and finding the times a recipe
 * step calls for ("bake for 35 minutes", "simmer 1-1 1/2 hours", "rest 5 to 10 min").
 */

export interface Preset {
  label: string
  seconds: number
}

/** Suggested timers; any time can also be set by hand. */
export const PRESETS: Preset[] = [
  { label: 'Soft-boiled egg', seconds: 6 * 60 + 30 },
  { label: 'Hard-boiled egg', seconds: 10 * 60 },
  { label: 'Pasta', seconds: 10 * 60 },
  { label: 'Rice', seconds: 18 * 60 },
  { label: 'Cookies', seconds: 10 * 60 },
  { label: 'Steep tea', seconds: 4 * 60 },
  { label: 'Rest the meat', seconds: 10 * 60 },
  { label: 'Bake', seconds: 30 * 60 },
]

/** "4:05", "1:02:30". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "35 min", "1 hr 15 min", "45 sec". */
export function formatLength(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts = [h ? `${h} hr` : '', m ? `${m} min` : '', s && !h ? `${s} sec` : ''].filter(Boolean)
  return parts.join(' ') || '0 sec'
}

export interface StepTime {
  /** The shortest time the step gives (check early). */
  seconds: number
  /** The top of a range ("20-25 minutes"), else null. */
  maxSeconds: number | null
  /** The words it came from. */
  text: string
}

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, 'forty-five': 45 }
const NUM = String.raw`(?:\d+(?:\.\d+)?(?:\s+\d\/\d|\s*[½¼¾])?|\d\/\d|[½¼¾]|an?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty-five)`
const UNIT = String.raw`(hours?|hrs?|minutes?|mins?|seconds?|secs?)`
const TIME = new RegExp(
  String.raw`(?<![\w/])(every\s+|up to\s+|for up to\s+)?(half an hour|(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?\s*${UNIT}(?:\s*(?:and\s+)?(${NUM})\s*(minutes?|mins?))?)\b`,
  'gi',
)

function num(text: string): number | null {
  const t = text.trim().toLowerCase()
  if (t in WORDS) return WORDS[t]
  const frac = (f: string) => ({ '½': 0.5, '¼': 0.25, '¾': 0.75 })[f] ?? (/^(\d)\/(\d)$/.test(f) ? +f[0] / +f[2] : NaN)
  const m = /^(\d+(?:\.\d+)?)?\s*(\d\/\d|[½¼¾])?$/.exec(t)
  if (!m || (!m[1] && !m[2])) return null
  const v = (m[1] ? +m[1] : 0) + (m[2] ? frac(m[2]) : 0)
  return Number.isFinite(v) ? v : null
}

const unitSeconds = (u: string) => (/^h/i.test(u) ? 3600 : /^m/i.test(u) ? 60 : 1)

/**
 * The times a step asks you to wait. Skips cadences ("turning every 3-4 minutes") and
 * storage times ("keeps up to 3 days"), and anything under 10 seconds.
 */
export function findTimes(step: string): StepTime[] {
  const out: StepTime[] = []
  for (const m of step.matchAll(TIME)) {
    if (m[1]) continue
    if (/^half an hour$/i.test(m[2])) {
      out.push({ seconds: 1800, maxSeconds: null, text: m[2] })
      continue
    }
    const lo = num(m[3])
    const hi = m[4] ? num(m[4]) : null
    if (lo == null) continue
    const per = unitSeconds(m[5])
    const extra = m[6] && m[7] ? (num(m[6]) ?? 0) * 60 : 0
    const seconds = Math.round(lo * per + extra)
    const maxSeconds = hi != null && hi > lo ? Math.round(hi * per + extra) : null
    if (seconds >= 10 && seconds <= 24 * 3600) out.push({ seconds, maxSeconds, text: m[2].trim() })
  }
  return out
}

/** A short name for a step's timer: its first verb or words ("Bake", "Simmer the sauce"). */
export function stepLabel(step: string, n: number): string {
  const words = step.replace(/^[^A-Za-z]+/, '').split(/\s+/).slice(0, 3).join(' ').replace(/[,.;:].*$/, '')
  return `Step ${n}: ${words}`
}

/** "35 min", or a range: "20–25 min", "1 hr–1 hr 30 min". */
export function formatSpan(seconds: number, maxSeconds: number | null): string {
  if (!maxSeconds) return formatLength(seconds)
  if (seconds % 60 === 0 && maxSeconds % 60 === 0 && maxSeconds < 3600) return `${seconds / 60}–${maxSeconds / 60} min`
  return `${formatLength(seconds)}–${formatLength(maxSeconds)}`
}
