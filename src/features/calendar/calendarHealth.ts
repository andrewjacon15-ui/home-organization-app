import type { Member } from '../../types'

/**
 * A connected Google Calendar syncs every 15 minutes and stamps the time at least hourly,
 * so one that hasn't for this long has stopped (Google or the sync job is failing).
 */
export const STALE_MS = 6 * 60 * 60_000

const first = (m: Member) => m.displayName.split(' ')[0] || 'Someone'
const names = (list: string[]) => (list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`)

/** "2:15 PM" today, "Thursday" this week, "Oct 3" before that. */
export function since(at: Date, now: Date): string {
  const days = (now.getTime() - at.getTime()) / 86_400_000
  if (at.toDateString() === now.toDateString()) return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (days < 6) return at.toLocaleDateString(undefined, { weekday: 'long' })
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * What to tell the household when someone's Google Calendar stopped updating on the family
 * board: their Google access expired (they reconnect it in Calendar), or it hasn't synced for
 * hours. Null when everything is current. Uses the people already loaded, so it costs no reads.
 */
export function calendarTrouble(members: Member[], userId: string, now: Date): string | null {
  const expired = members.filter((m) => m.calendar?.status === 'needs_reconnect')
  if (expired.length) {
    const others = expired.filter((m) => m.id !== userId).map(first)
    if (others.length === expired.length) {
      return others.length === 1
        ? `${others[0]}’s Google Calendar stopped updating. ${others[0]} can reconnect it in Calendar.`
        : `Google Calendar stopped updating for ${names(others)}. Each can reconnect it in Calendar.`
    }
    return others.length ? `Google Calendar stopped updating for you and ${names(others)}. Reconnect it in Calendar.` : 'Your Google Calendar stopped updating. Reconnect it in Calendar.'
  }
  const synced = members.flatMap((m) => {
    const c = m.calendar
    const at = c?.status === 'connected' ? c.lastSyncAt?.toDate?.() : undefined
    return at ? [at] : []
  })
  const stale = synced.filter((at) => now.getTime() - at.getTime() > STALE_MS)
  if (!stale.length) return null
  const oldest = new Date(Math.min(...stale.map((d) => d.getTime())))
  return `Google Calendar hasn’t updated since ${since(oldest, now)}, so events may be out of date.`
}
