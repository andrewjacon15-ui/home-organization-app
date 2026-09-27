/** YYYY-MM-DD for a date in the device's local timezone. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parses YYYY-MM-DD as a local-midnight Date (not UTC). */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, days: number): string {
  const date = fromDateKey(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/** Human label for a due date relative to today: "Today", "Tomorrow", "Yesterday", or "Mon, Oct 5". */
export function relativeDayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return 'Today'
  if (key === addDays(todayKey, 1)) return 'Tomorrow'
  if (key === addDays(todayKey, -1)) return 'Yesterday'
  return fromDateKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** The device's IANA timezone, e.g. "America/New_York". */
export function detectTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** All IANA zones the browser knows, with the given zone guaranteed present. */
export function timezoneOptions(current: string): string[] {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return zones.includes(current) ? zones : [current, ...zones]
}

/** The date key of the week's first day (0 = Sunday, 1 = Monday) on or before `key`. */
export function startOfWeek(key: string, weekStartsOn = 0): string {
  const offset = (fromDateKey(key).getDay() - weekStartsOn + 7) % 7
  return addDays(key, -offset)
}

/** Whole days from `a` to `b` (positive when b is later). DST-safe. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}
