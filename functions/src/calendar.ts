import { createHash } from 'node:crypto'
import { calendarKey, eventDocId, normalizeEvent } from './normalize.js'
import type { CalendarStore, EventDoc, GoogleApi, GoogleCalendarEntry, StoredCalendar, StoredTokens } from './types.js'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

/** How far back and ahead we mirror. Older synced events are pruned. */
export const SYNC_PAST_DAYS = 30
export const SYNC_FUTURE_DAYS = 120

const DAY_MS = 86_400_000

/** A user-facing error (maps to HttpsError in index.ts). */
export class CalendarError extends Error {
  constructor(
    public code: 'permission-denied' | 'failed-precondition' | 'invalid-argument' | 'already-exists' | 'not-found',
    message: string,
  ) {
    super(message)
  }
}

/** Google's "your refresh token is dead" (revoked, expired, or 7-day Testing-mode expiry). */
/**
 * The human-readable part of an error from Google's OAuth or Calendar APIs, e.g.
 * "unauthorized_client: Unauthorized" or "Google Calendar API has not been used in project…".
 * Never includes request data, so it's safe to show the user.
 */
export function googleErrorDetail(err: unknown): string {
  const e = err as {
    message?: string
    response?: { data?: { error?: string | { message?: string }; error_description?: string } }
  }
  const data = e?.response?.data
  const oauthError = typeof data?.error === 'string' ? data.error : undefined
  const detail =
    (oauthError && [oauthError, data?.error_description].filter(Boolean).join(': ')) ||
    (typeof data?.error === 'object' ? data.error.message : undefined) ||
    e?.message ||
    String(err)
  return detail.length > 300 ? `${detail.slice(0, 297)}...` : detail
}

export function isInvalidGrant(err: unknown): boolean {
  const e = err as { message?: string; response?: { data?: { error?: string } } }
  return e?.response?.data?.error === 'invalid_grant' || /invalid_grant/.test(e?.message ?? '')
}

export interface SyncResult {
  upserted: number
  deleted: number
  status: 'connected' | 'needs_reconnect'
}

const HEX = /^#[0-9a-f]{6}$/i

/** Merges Google's calendar list with what the family already chose (show/hide, color, nickname, people). */
export function mergeCalendars(uid: string, entries: GoogleCalendarEntry[], existing: StoredCalendar[]): { keep: StoredCalendar[]; removed: string[] } {
  const byKey = new Map(existing.map((c) => [c.key, c]))
  const keep = entries.map((e) => {
    const key = calendarKey(uid, e.id)
    const googleColor = e.backgroundColor && HEX.test(e.backgroundColor) ? e.backgroundColor.toLowerCase() : '#57534e'
    const prev = byKey.get(key)
    if (prev) return { ...prev, name: e.summary || prev.name, googleColor, primary: !!e.primary }
    // New calendar: shown if it's the primary or it's checked in Google Calendar.
    return { key, ownerId: uid, calendarId: e.id, name: e.summary || 'Calendar', googleColor, primary: !!e.primary, enabled: !!e.primary || e.selected === true, color: googleColor, memberIds: [uid] }
  })
  const kept = new Set(keep.map((c) => c.key))
  return { keep, removed: existing.filter((c) => !kept.has(c.key)).map((c) => c.key) }
}

/** Mirrors every enabled calendar of one person into the family's events collection. */
export async function syncMember(
  deps: { store: CalendarStore; google: GoogleApi; now?: Date },
  familyId: string,
  uid: string,
  tokens: StoredTokens,
): Promise<SyncResult> {
  const { store, google } = deps
  const now = deps.now ?? new Date()
  const timeMin = new Date(now.getTime() - SYNC_PAST_DAYS * DAY_MS)
  const timeMax = new Date(now.getTime() + SYNC_FUTURE_DAYS * DAY_MS)

  let calendars: StoredCalendar[]
  const docs: { id: string; data: EventDoc }[] = []
  try {
    // Calendar links (kind ics) belong to the feed sync, not to this person's Google account.
    const stored = (await store.listCalendars(familyId, uid)).filter((c) => c.kind !== 'ics')
    const merged = mergeCalendars(uid, await google.listCalendars(tokens.refreshToken), stored)
    calendars = merged.keep
    const storedByKey = new Map(stored.map((c) => [c.key, c]))
    await store.upsertCalendars(familyId, calendars.filter((c) => !sameJson(c, storedByKey.get(c.key))))
    await store.deleteCalendars(familyId, merged.removed)

    for (const c of calendars.filter((x) => x.enabled)) {
      for (const e of await google.listEvents(tokens.refreshToken, c.calendarId, timeMin, timeMax)) {
        const data = normalizeEvent(e, uid, c.key)
        if (data) docs.push({ id: eventDocId(c.key, data.googleEventId), data })
      }
    }
  } catch (err) {
    if (isInvalidGrant(err)) {
      // Keep the events that are already there; the UI shows a Reconnect button.
      await store.setCalendarStatus(familyId, uid, {
        status: 'needs_reconnect',
        email: tokens.email,
        error: 'Google access expired or was revoked.',
      })
      return { upserted: 0, deleted: 0, status: 'needs_reconnect' }
    }
    throw err
  }

  // Nothing changed at Google since the last sync: skip re-reading every stored event (about a read
  // per event every 15 minutes otherwise, the app's biggest Firestore cost). Once a day it checks
  // in full anyway, in case something was changed or removed on our side.
  const digest = eventsDigest(docs)
  const fullCheck = now.getUTCHours() === FULL_CHECK_UTC_HOUR && now.getUTCMinutes() < 15
  if (tokens.syncDigest === digest && !fullCheck) {
    await refreshStatus(store, familyId, uid, tokens, calendars, docs.length, now, false)
    return { upserted: 0, deleted: 0, status: 'connected' }
  }

  // Write only what changed: a sync every 15 minutes that rewrote every event would cost a
  // write per event per run, and push every event again to every open screen.
  const existing = await store.listGoogleEvents(familyId, uid)
  const keep = new Set(docs.map((d) => d.id))
  const changed = docs.filter((d) => !sameEvent(existing.get(d.id), d.data))
  const stale = [...existing.keys()].filter((id) => !keep.has(id))

  await store.upsertEvents(familyId, changed)
  await store.deleteEvents(familyId, stale)
  if (tokens.syncDigest !== digest) await store.saveSyncDigest(familyId, uid, digest)
  await refreshStatus(store, familyId, uid, tokens, calendars, docs.length, now, changed.length + stale.length > 0)
  return { upserted: changed.length, deleted: stale.length, status: 'connected' }
}

const FULL_CHECK_UTC_HOUR = 9

/** Order-independent fingerprint of what a sync would store. */
export function eventsDigest(docs: { id: string; data: EventDoc }[]): string {
  const rows = docs.map((d) => JSON.stringify([d.id, { ...d.data, start: d.data.start.toISOString(), end: d.data.end.toISOString() }])).sort()
  return createHash('sha1').update(rows.join('\n')).digest('base64url')
}

async function refreshStatus(store: CalendarStore, familyId: string, uid: string, tokens: StoredTokens, calendars: StoredCalendar[], eventCount: number, now: Date, changed: boolean) {
  const status = { status: 'connected' as const, email: tokens.email, lastSyncAt: now, eventCount, calendarCount: calendars.filter((c) => c.enabled).length }
  const prev = await store.getCalendarStatus(familyId, uid)
  // The "last synced" time is refreshed hourly when nothing else changed (each write reaches every device).
  const fresh =
    prev?.status === 'connected' &&
    prev.email === status.email &&
    prev.eventCount === status.eventCount &&
    prev.calendarCount === status.calendarCount &&
    now.getTime() - prev.lastSyncAt.getTime() < STATUS_REFRESH_MS
  if (!fresh || changed) await store.setCalendarStatus(familyId, uid, status)
}

const STATUS_REFRESH_MS = 60 * 60_000

function sameJson(a: unknown, b: unknown): boolean {
  return b !== undefined && JSON.stringify(a) === JSON.stringify(b)
}

const EVENT_FIELDS = ['source', 'sourceUserId', 'googleEventId', 'calendarKey', 'title', 'allDay', 'startDate', 'endDate', 'location', 'htmlLink'] as const

/** Same event as stored (times compared as instants; missing optional fields count as equal). */
export function sameEvent(stored: EventDoc | undefined, next: EventDoc): boolean {
  if (!stored) return false
  if (stored.start?.getTime() !== next.start.getTime() || stored.end?.getTime() !== next.end.getTime()) return false
  return EVENT_FIELDS.every((k) => (stored[k] ?? null) === (next[k] ?? null))
}

async function requireMember(store: CalendarStore, familyId: unknown, uid: string | undefined): Promise<string> {
  if (!uid) throw new CalendarError('permission-denied', 'Sign in first.')
  if (typeof familyId !== 'string' || !familyId) throw new CalendarError('invalid-argument', 'familyId is required.')
  if (!(await store.isMember(familyId, uid))) throw new CalendarError('permission-denied', 'Not a member of this family.')
  return familyId
}

/** Handles "Connect my calendar": exchange the popup's code, store the refresh token, sync once. */
export async function connectCalendar(
  deps: { store: CalendarStore; google: GoogleApi; now?: Date },
  uid: string | undefined,
  data: { familyId?: unknown; code?: unknown },
) {
  const familyId = await requireMember(deps.store, data.familyId, uid)
  if (typeof data.code !== 'string' || !data.code) throw new CalendarError('invalid-argument', 'Missing authorization code.')

  const exchanged = await deps.google.exchangeCode(data.code)
  if (!exchanged.scope.split(' ').includes(CALENDAR_SCOPE)) {
    throw new CalendarError('failed-precondition', 'Calendar access was not granted. Try again and leave the calendar box checked.')
  }

  // Google only issues a refresh token on first consent. On a reconnect of the
  // same account it may omit it, in which case the stored one is still valid.
  const existing = await deps.store.getTokens(familyId, uid!)
  const refreshToken = exchanged.refreshToken ?? (existing?.email === exchanged.email ? existing.refreshToken : undefined)
  if (!refreshToken) {
    throw new CalendarError(
      'failed-precondition',
      'Google did not grant offline access. Remove "Family Organizer" at myaccount.google.com/connections, then connect again.',
    )
  }

  const tokens: StoredTokens = { refreshToken, email: exchanged.email, scope: exchanged.scope }
  await deps.store.saveTokens(familyId, uid!, tokens)
  const result = await syncMember(deps, familyId, uid!, tokens)
  return { email: exchanged.email, ...result }
}

/** Handles "Sync now". */
export async function syncMine(deps: { store: CalendarStore; google: GoogleApi; now?: Date }, uid: string | undefined, data: { familyId?: unknown }) {
  const familyId = await requireMember(deps.store, data.familyId, uid)
  const tokens = await deps.store.getTokens(familyId, uid!)
  if (!tokens) throw new CalendarError('failed-precondition', 'No calendar connected.')
  return syncMember(deps, familyId, uid!, tokens)
}

/** Handles "Disconnect": revoke at Google, forget the token, remove this person's synced events. */
export async function disconnectCalendar(deps: { store: CalendarStore; google: GoogleApi }, uid: string | undefined, data: { familyId?: unknown }) {
  const familyId = await requireMember(deps.store, data.familyId, uid)
  const tokens = await deps.store.getTokens(familyId, uid!)
  if (tokens) {
    // Best effort: a token that's already dead can't be revoked, and that's fine.
    await deps.google.revoke(tokens.refreshToken).catch(() => undefined)
  }
  await deps.store.deleteTokens(familyId, uid!)
  await deps.store.deleteEvents(familyId, await deps.store.listGoogleEventIds(familyId, uid!))
  await deps.store.deleteCalendars(familyId, (await deps.store.listCalendars(familyId, uid!)).filter((c) => c.kind !== 'ics').map((c) => c.key))
  await deps.store.setCalendarStatus(familyId, uid!, null)
  return { ok: true }
}

/** Scheduled job: sync everyone. One person's failure doesn't stop the rest. */
export async function syncAll(deps: { store: CalendarStore; google: GoogleApi; now?: Date; log?: (msg: string, extra?: object) => void }) {
  const log = deps.log ?? (() => undefined)
  const members = await deps.store.listConnected()
  const results = { synced: 0, needsReconnect: 0, failed: 0 }
  for (const m of members) {
    try {
      const r = await syncMember(deps, m.familyId, m.uid, m.tokens)
      if (r.status === 'connected') results.synced++
      else results.needsReconnect++
    } catch (err) {
      results.failed++
      log('calendar sync failed', { familyId: m.familyId, uid: m.uid, error: String(err) })
    }
  }
  return results
}
