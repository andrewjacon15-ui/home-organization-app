// Calendar links (.ics / webcal): school calendars, sports teams, holidays, and Apple Calendar's
// "Public Calendar" links. Read-only. Each link is a calendar doc with kind 'ics', so colors,
// people, the filter, and reminders treat it like any synced calendar.
import ICAL from 'ical.js'
import { SYNC_FUTURE_DAYS, SYNC_PAST_DAYS, CalendarError, sameEvent } from './calendar.js'
import { hash } from './normalize.js'
import type { EventDoc, StoredCalendar } from './types.js'

const DAY_MS = 86_400_000
/** Links are re-read about once an hour by the 15-minute calendar job (schools don't change by the minute). */
export const FEED_REFRESH_MS = 55 * 60_000
const MAX_BYTES = 5 * 1024 * 1024
const MAX_EVENTS = 3000
/** Occurrences walked per repeating event (a daily series from years ago still finishes quickly). */
const MAX_STEPS = 6000
const HEX = /^#[0-9a-f]{6}$/i

export interface FeedCalendar extends StoredCalendar {
  kind: 'ics'
  url: string
  lastSyncAt?: Date | null
  error?: string | null
  eventCount?: number
}

export interface FeedStore {
  isMember(familyId: string, uid: string): Promise<boolean>
  familyTimezone(familyId: string): Promise<string | null>
  listFeeds(): Promise<{ familyId: string; feed: FeedCalendar }[]>
  getFeed(familyId: string, key: string): Promise<FeedCalendar | null>
  saveFeed(familyId: string, feed: FeedCalendar): Promise<void>
  /** Only the sync result, so it never overwrites a color or name changed in Settings meanwhile. */
  setFeedStatus(familyId: string, key: string, status: { lastSyncAt: Date; error: string | null; eventCount?: number }): Promise<void>
  deleteFeed(familyId: string, key: string): Promise<void>
  listFeedEvents(familyId: string, key: string): Promise<Map<string, EventDoc>>
  upsertEvents(familyId: string, events: { id: string; data: EventDoc }[]): Promise<void>
  deleteEvents(familyId: string, ids: string[]): Promise<void>
}

export type FeedFetch = (url: string) => Promise<string>

// ---------------------------------------------------------------------------------------------
// URLs

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./]

/** webcal:// → https://; only public http(s) hosts (no localhost, private networks, or cloud metadata). */
export function feedUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new CalendarError('invalid-argument', 'Paste the calendar link.')
  const text = raw.trim().replace(/^webcals?:\/\//i, 'https://')
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new CalendarError('invalid-argument', 'That doesn’t look like a link. It should start with https:// or webcal://.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new CalendarError('invalid-argument', 'Calendar links start with https:// or webcal://.')
  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    host.includes(':') || // IPv6 literal
    PRIVATE_V4.some((r) => r.test(host)) ||
    !host.includes('.')
  ) {
    throw new CalendarError('invalid-argument', 'That link points to a private address the server can’t reach.')
  }
  url.hash = ''
  return url.toString()
}

export const feedKey = (url: string) => `ics_${hash(url)}`

/** Fetches a calendar file: 20 s timeout, 5 MB cap, a clear User-Agent. */
export const httpFeedFetch: FeedFetch = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FamilyOrganizer/1.0 (calendar subscription)', Accept: 'text/calendar, */*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new CalendarError('failed-precondition', `The calendar link answered ${res.status}${res.status === 404 ? ' (not found). Check the link is still shared.' : '.'}`)
  feedUrl(res.url || url) // a redirect must not land on a private address either
  const length = Number(res.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) throw new CalendarError('failed-precondition', 'That calendar file is too large (over 5 MB).')
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new CalendarError('failed-precondition', 'That calendar file is too large (over 5 MB).')
  return text
}

// ---------------------------------------------------------------------------------------------
// Parsing

/** UTC instant for a wall-clock time in an IANA zone (for floating times, or zones the file didn't describe). */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, zone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  let tz = zone
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    tz = 'UTC'
  }
  const offset = (at: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(new Date(at))
        .filter((p) => p.type !== 'literal')
        .map((p) => [p.type, Number(p.value)]),
    )
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - at
  }
  // Two passes settle the offset across a daylight-saving change.
  let at = guess - offset(guess)
  at = guess - offset(at)
  return new Date(at)
}

const pad = (n: number) => String(n).padStart(2, '0')
const dateKey = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`
const utcMidnight = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const addDaysKey = (key: string, n: number) => utcMidnight(key).getTime() + n * DAY_MS

/** A Time as an instant: zoned and UTC times convert exactly; floating ones use the TZID or the family's zone. */
function instant(t: ICAL.Time, fallbackZone: string): Date {
  const zone = t.zone
  const floating = !zone || zone === ICAL.Timezone.localTimezone || zone.tzid === 'floating'
  if (!floating) return t.toJSDate()
  return zonedToUtc(t.year, t.month, t.day, t.hour, t.minute, t.second, (t as unknown as { timezone?: string }).timezone || fallbackZone)
}

export interface ParsedEvent {
  id: string
  title: string
  allDay: boolean
  start: Date
  end: Date
  startDate?: string
  endDate?: string
  location?: string
}

function toEvent(item: ICAL.Event, start: ICAL.Time, end: ICAL.Time | null, id: string, zone: string): ParsedEvent | null {
  const title = (item.summary ?? '').trim() || '(No title)'
  const location = (item.location ?? '').trim()
  const extra = location ? { location: location.slice(0, 300) } : {}
  if (start.isDate) {
    const startDate = dateKey(start)
    const endDate = end && end.isDate && dateKey(end) > startDate ? dateKey(end) : new Date(addDaysKey(startDate, 1)).toISOString().slice(0, 10)
    return { id, title: title.slice(0, 200), allDay: true, startDate, endDate, start: utcMidnight(startDate), end: utcMidnight(endDate), ...extra }
  }
  const s = instant(start, zone)
  const e = end ? instant(end, zone) : s
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null
  return { id, title: title.slice(0, 200), allDay: false, start: s, end: e < s ? s : e, ...extra }
}

/** Every event (repeats expanded) that overlaps [from, to). Cancelled events are skipped. */
export function parseFeed(text: string, from: Date, to: Date, zone: string): { name: string | null; events: ParsedEvent[] } {
  let root: ICAL.Component
  try {
    root = new ICAL.Component(ICAL.parse(text))
  } catch {
    throw new CalendarError('failed-precondition', 'That link isn’t a calendar file (.ics). Copy the subscribe or iCal link, not the web page.')
  }
  if (root.name !== 'vcalendar') throw new CalendarError('failed-precondition', 'That link isn’t a calendar file (.ics).')
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz)
    } catch {
      // A malformed zone falls back to the TZID name or the family's zone.
    }
  }
  const name = (root.getFirstPropertyValue('x-wr-calname') as string | null)?.trim() || null

  const masters = new Map<string, ICAL.Event>()
  const exceptions: ICAL.Event[] = []
  for (const v of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(v)
    if (!ev.uid || !ev.startDate) continue
    if (ev.isRecurrenceException()) exceptions.push(ev)
    else masters.set(ev.uid, ev)
  }
  for (const ex of exceptions) masters.get(ex.uid)?.relateException(ex)

  const cancelled = (e: ICAL.Event) => String(e.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED'
  const overlaps = (p: ParsedEvent) => p.end.getTime() > from.getTime() && p.start.getTime() < to.getTime()
  const out: ParsedEvent[] = []

  for (const ev of masters.values()) {
    if (out.length >= MAX_EVENTS) break
    if (!ev.isRecurring()) {
      if (cancelled(ev)) continue
      const p = toEvent(ev, ev.startDate, ev.endDate, ev.uid, zone)
      if (p && overlaps(p)) out.push(p)
      continue
    }
    const it = ev.iterator()
    for (let step = 0, next = it.next(); next && step < MAX_STEPS && out.length < MAX_EVENTS; step++, next = it.next()) {
      const occ = ev.getOccurrenceDetails(next)
      const p = toEvent(occ.item, occ.startDate, occ.endDate, `${ev.uid}@${next.toString()}`, zone)
      if (!p) continue
      if (p.start.getTime() >= to.getTime()) break
      if (overlaps(p) && !cancelled(occ.item)) out.push(p)
    }
  }
  return { name, events: out }
}

// ---------------------------------------------------------------------------------------------
// Sync

export const feedEventId = (key: string, id: string) => `f_${key}_${hash(id)}`

export async function syncFeed(deps: { store: FeedStore; fetchFeed: FeedFetch; now?: Date }, familyId: string, feed: FeedCalendar) {
  const { store } = deps
  const now = deps.now ?? new Date()
  const existing = await store.listFeedEvents(familyId, feed.key)
  if (!feed.enabled) {
    await store.deleteEvents(familyId, [...existing.keys()])
    return { eventCount: 0, changed: 0 }
  }
  const zone = (await store.familyTimezone(familyId)) ?? 'UTC'
  let parsed: ReturnType<typeof parseFeed>
  try {
    parsed = parseFeed(await deps.fetchFeed(feed.url), new Date(now.getTime() - SYNC_PAST_DAYS * DAY_MS), new Date(now.getTime() + SYNC_FUTURE_DAYS * DAY_MS), zone)
  } catch (err) {
    // Keep the events already there; Settings shows what went wrong.
    const error = err instanceof Error ? err.message : String(err)
    await store.setFeedStatus(familyId, feed.key, { error, lastSyncAt: now })
    throw err
  }
  const docs = parsed.events.map((p) => {
    const data: EventDoc = {
      source: 'ics',
      sourceUserId: feed.ownerId,
      googleEventId: p.id.slice(0, 300),
      calendarKey: feed.key,
      title: p.title,
      start: p.start,
      end: p.end,
      allDay: p.allDay,
      ...(p.allDay ? { startDate: p.startDate, endDate: p.endDate } : {}),
      ...(p.location ? { location: p.location } : {}),
    }
    return { id: feedEventId(feed.key, p.id), data }
  })
  const keep = new Set(docs.map((d) => d.id))
  const changed = docs.filter((d) => !sameEvent(existing.get(d.id), d.data))
  const stale = [...existing.keys()].filter((id) => !keep.has(id))
  await store.upsertEvents(familyId, changed)
  await store.deleteEvents(familyId, stale)
  await store.setFeedStatus(familyId, feed.key, { error: null, lastSyncAt: now, eventCount: docs.length })
  return { eventCount: docs.length, changed: changed.length + stale.length, name: parsed.name }
}

async function requireMember(store: FeedStore, familyId: unknown, uid: string | undefined): Promise<string> {
  if (!uid) throw new CalendarError('permission-denied', 'Sign in first.')
  if (typeof familyId !== 'string' || !familyId) throw new CalendarError('invalid-argument', 'familyId is required.')
  if (!(await store.isMember(familyId, uid))) throw new CalendarError('permission-denied', 'Not a member of this family.')
  return familyId
}

/** "Add a calendar link": checks the link works, saves it, and brings its events in. */
export async function addFeed(
  deps: { store: FeedStore; fetchFeed: FeedFetch; now?: Date },
  uid: string | undefined,
  data: { familyId?: unknown; url?: unknown; name?: unknown; color?: unknown; memberIds?: unknown },
) {
  const familyId = await requireMember(deps.store, data.familyId, uid)
  const url = feedUrl(data.url)
  const key = feedKey(url)
  if (await deps.store.getFeed(familyId, key)) throw new CalendarError('already-exists', 'That calendar link is already added.')
  const color = typeof data.color === 'string' && HEX.test(data.color) ? data.color.toLowerCase() : '#0f766e'
  const memberIds = Array.isArray(data.memberIds) ? data.memberIds.filter((x): x is string => typeof x === 'string').slice(0, 20) : []
  const typed = typeof data.name === 'string' ? data.name.trim().slice(0, 60) : ''
  const feed: FeedCalendar = {
    key,
    kind: 'ics',
    url,
    ownerId: uid!,
    calendarId: url,
    name: typed || 'Calendar',
    googleColor: color,
    color,
    primary: false,
    enabled: true,
    memberIds: memberIds.length ? memberIds : [uid!],
  }
  // Read it once before saving, so a bad link is reported instead of stored.
  const now = deps.now ?? new Date()
  const zone = (await deps.store.familyTimezone(familyId)) ?? 'UTC'
  const text = await deps.fetchFeed(url)
  const parsed = parseFeed(text, new Date(now.getTime() - SYNC_PAST_DAYS * DAY_MS), new Date(now.getTime() + SYNC_FUTURE_DAYS * DAY_MS), zone)
  if (!typed && parsed.name) feed.name = parsed.name.slice(0, 60)
  await deps.store.saveFeed(familyId, feed)
  const result = await syncFeed({ ...deps, fetchFeed: async () => text }, familyId, feed)
  return { key, name: feed.name, eventCount: result.eventCount }
}

export async function refreshFeed(deps: { store: FeedStore; fetchFeed: FeedFetch; now?: Date }, uid: string | undefined, data: { familyId?: unknown; key?: unknown }) {
  const familyId = await requireMember(deps.store, data.familyId, uid)
  const feed = typeof data.key === 'string' ? await deps.store.getFeed(familyId, data.key) : null
  if (!feed) throw new CalendarError('not-found', 'That calendar link was removed.')
  return syncFeed(deps, familyId, feed)
}

export async function removeFeed(deps: { store: FeedStore }, uid: string | undefined, data: { familyId?: unknown; key?: unknown }) {
  const familyId = await requireMember(deps.store, data.familyId, uid)
  if (typeof data.key !== 'string' || !data.key.startsWith('ics_')) throw new CalendarError('invalid-argument', 'Unknown calendar link.')
  await deps.store.deleteEvents(familyId, [...(await deps.store.listFeedEvents(familyId, data.key)).keys()])
  await deps.store.deleteFeed(familyId, data.key)
  return { ok: true }
}

/** Run by the 15-minute calendar job: each link about once an hour. */
export async function syncAllFeeds(deps: { store: FeedStore; fetchFeed: FeedFetch; now?: Date; log?: (msg: string, extra?: object) => void }) {
  const now = deps.now ?? new Date()
  const results = { synced: 0, skipped: 0, failed: 0 }
  for (const { familyId, feed } of await deps.store.listFeeds()) {
    const age = now.getTime() - (feed.lastSyncAt?.getTime() ?? 0)
    if (age < FEED_REFRESH_MS) {
      results.skipped++
      continue
    }
    try {
      await syncFeed(deps, familyId, feed)
      results.synced++
    } catch (err) {
      results.failed++
      deps.log?.('calendar link sync failed', { familyId, key: feed.key, error: String(err) })
    }
  }
  return results
}
