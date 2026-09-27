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
