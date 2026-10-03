import type { EventDoc, GoogleEvent } from './types.js'

/** Short, stable hash so long calendar IDs make compact, Firestore-safe keys. */
export function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/** Stable key for one person's Google calendar. */
export function calendarKey(uid: string, calendarId: string): string {
  return `${uid}_${hash(calendarId)}`.replace(/[^A-Za-z0-9_-]/g, '_')
}

/** Deterministic doc ID so re-syncs overwrite instead of duplicating (unique per calendar). */
export function eventDocId(calKey: string, googleEventId: string): string {
  return `g_${calKey}_${googleEventId}`.replace(/[^A-Za-z0-9_-]/g, '_')
}

/** "Home" / "Office" working-location markers are noise on a family calendar. */
const SKIPPED_TYPES = new Set(['workingLocation'])

/** YYYY-MM-DD as a UTC-midnight Date (all-day events have no timezone). */
function dateKeyToUtc(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Converts a Google event to our shape, or null if it should be skipped (cancelled, malformed). */
export function normalizeEvent(event: GoogleEvent, uid: string, calKey: string): EventDoc | null {
  if (!event.id || event.status === 'cancelled' || SKIPPED_TYPES.has(event.eventType ?? '')) return null
  const base = {
    source: 'google' as const,
    sourceUserId: uid,
    googleEventId: event.id,
    calendarKey: calKey,
    title: (event.summary ?? '').trim() || '(No title)',
    ...(event.location ? { location: event.location } : {}),
    ...(event.htmlLink ? { htmlLink: event.htmlLink } : {}),
  }

  if (event.start?.date) {
    const startDate = event.start.date
    const endDate = event.end?.date ?? startDate
    return { ...base, allDay: true, startDate, endDate, start: dateKeyToUtc(startDate), end: dateKeyToUtc(endDate) }
  }

  if (event.start?.dateTime) {
    const start = new Date(event.start.dateTime)
    const end = event.end?.dateTime ? new Date(event.end.dateTime) : start
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
    return { ...base, allDay: false, start, end: end < start ? start : end }
  }

  return null
}
