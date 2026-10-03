import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CALENDAR_SCOPE, CalendarError, connectCalendar, disconnectCalendar, googleErrorDetail, mergeCalendars, syncAll, syncMember, syncMine } from './calendar.js'
import { calendarKey, eventDocId } from './normalize.js'
import type { CalendarStatus, CalendarStore, EventDoc, GoogleApi, GoogleCalendarEntry, GoogleEvent, StoredCalendar, StoredTokens } from './types.js'

const NOW = new Date('2026-10-01T12:00:00Z')
const FAM = 'fam1'
const SCOPES = `openid email ${CALENDAR_SCOPE}`

/** In-memory stand-in for Firestore. */
class FakeStore implements CalendarStore {
  members = new Set<string>()
  tokens = new Map<string, StoredTokens>()
  events = new Map<string, EventDoc>()
  status = new Map<string, CalendarStatus | null>()
  calendars = new Map<string, StoredCalendar>()
  key = (f: string, u: string) => `${f}/${u}`

  async isMember(f: string, u: string) {
    return this.members.has(this.key(f, u))
  }
  async getTokens(f: string, u: string) {
    return this.tokens.get(this.key(f, u)) ?? null
  }
  async saveTokens(f: string, u: string, t: StoredTokens) {
    this.tokens.set(this.key(f, u), t)
  }
  async deleteTokens(f: string, u: string) {
    this.tokens.delete(this.key(f, u))
  }
  async listConnected() {
    return [...this.tokens].map(([k, tokens]) => {
      const [familyId, uid] = k.split('/')
      return { familyId, uid, tokens }
    })
  }
  async listGoogleEventIds(_f: string, u: string) {
    return [...this.events].filter(([, e]) => e.sourceUserId === u && e.source === 'google').map(([id]) => id)
  }
  writes = 0
  eventReads = 0
  async listGoogleEvents(_f: string, u: string) {
    this.eventReads++
    return new Map([...this.events].filter(([, e]) => e.sourceUserId === u && e.source === 'google'))
  }
  async getCalendarStatus(f: string, u: string) {
    return this.status.get(this.key(f, u)) ?? null
  }
  async upsertEvents(_f: string, events: { id: string; data: EventDoc }[]) {
    this.writes += events.length
    for (const { id, data } of events) this.events.set(id, data)
  }
  async deleteEvents(_f: string, ids: string[]) {
    for (const id of ids) this.events.delete(id)
  }
  async setCalendarStatus(f: string, u: string, s: CalendarStatus | null) {
    this.status.set(this.key(f, u), s)
  }
  async listCalendars(_f: string, u: string) {
    return [...this.calendars.values()].filter((c) => c.ownerId === u)
  }
  async upsertCalendars(_f: string, list: StoredCalendar[]) {
    for (const c of list) this.calendars.set(c.key, c)
  }
  async deleteCalendars(_f: string, keys: string[]) {
    for (const k of keys) this.calendars.delete(k)
  }
  async saveSyncDigest(f: string, u: string, digest: string) {
    const t = this.tokens.get(this.key(f, u))
    if (t) this.tokens.set(this.key(f, u), { ...t, syncDigest: digest })
  }
}

const PRIMARY: GoogleCalendarEntry = { id: 'bob@example.com', summary: 'Bob', backgroundColor: '#039BE5', primary: true, selected: true }
const WORK: GoogleCalendarEntry = { id: 'work123@group.calendar.google.com', summary: 'Work', backgroundColor: '#9e69af', selected: true }
const HOLIDAYS: GoogleCalendarEntry = { id: 'en.usa#holiday@group.v.calendar.google.com', summary: 'Holidays in United States', backgroundColor: '#0b8043', selected: false }

function stubGoogle(overrides: Partial<GoogleApi> = {}) {
  return {
    exchangeCode: vi.fn<GoogleApi['exchangeCode']>(async () => ({ refreshToken: 'rt-new', email: 'bob@example.com', scope: SCOPES })),
    listCalendars: vi.fn<GoogleApi['listCalendars']>(async () => [PRIMARY]),
    listEvents: vi.fn<GoogleApi['listEvents']>(async () => [] as GoogleEvent[]),
    revoke: vi.fn<GoogleApi['revoke']>(async () => undefined),
    ...overrides,
  }
}

const timed = (id: string, summary = id): GoogleEvent => ({
  id,
  summary,
  start: { dateTime: '2026-10-02T15:00:00Z' },
  end: { dateTime: '2026-10-02T16:00:00Z' },
})

const allDay = (id: string, summary: string): GoogleEvent => ({ id, summary, start: { date: '2026-10-03' }, end: { date: '2026-10-04' } })

const invalidGrant = () => Object.assign(new Error('invalid_grant'), { response: { data: { error: 'invalid_grant' } } })

let store: FakeStore
beforeEach(() => {
  store = new FakeStore()
  store.members.add(`${FAM}/bob`)
})

describe('syncMember', () => {
  const tokens = { refreshToken: 'rt', email: 'bob@example.com', scope: SCOPES }
  const primaryKey = calendarKey('bob', PRIMARY.id)
  const workKey = calendarKey('bob', WORK.id)

  it('mirrors events, removes ones deleted in Google, and records status', async () => {
    store.events.set('g_bob_gone', { ...({} as EventDoc), source: 'google', sourceUserId: 'bob' })
    store.events.set('g_alice_keep', { ...({} as EventDoc), source: 'google', sourceUserId: 'alice' })
    const google = stubGoogle({ listEvents: vi.fn(async () => [timed('e1'), timed('e2'), { id: 'e3', status: 'cancelled' }]) })

    const result = await syncMember({ store, google, now: NOW }, FAM, 'bob', tokens)

    expect(result).toEqual({ upserted: 2, deleted: 1, status: 'connected' })
    expect([...store.events.keys()].sort()).toEqual(['g_alice_keep', eventDocId(primaryKey, 'e1'), eventDocId(primaryKey, 'e2')].sort())
    expect(store.events.get(eventDocId(primaryKey, 'e1'))?.calendarKey).toBe(primaryKey)
    expect(store.status.get(`${FAM}/bob`)).toEqual({ status: 'connected', email: 'bob@example.com', lastSyncAt: NOW, eventCount: 2, calendarCount: 1 })
  })

  it('writes only events that changed, and refreshes the status hourly when nothing did', async () => {
    let events = [timed('e1'), timed('e2')]
    const google = stubGoogle({ listEvents: vi.fn(async () => events) })
    await syncMember({ store, google, now: NOW }, FAM, 'bob', tokens)
    expect(store.writes).toBe(2)

    const later = new Date(NOW.getTime() + 15 * 60_000)
    expect(await syncMember({ store, google, now: later }, FAM, 'bob', tokens)).toEqual({ upserted: 0, deleted: 0, status: 'connected' })
    expect(store.writes).toBe(2)
    expect((store.status.get(`${FAM}/bob`) as { lastSyncAt: Date }).lastSyncAt).toEqual(NOW)

    events = [timed('e1', 'Renamed'), timed('e2')]
    expect(await syncMember({ store, google, now: later }, FAM, 'bob', tokens)).toMatchObject({ upserted: 1 })
    expect(store.writes).toBe(3)
    expect((store.status.get(`${FAM}/bob`) as { lastSyncAt: Date }).lastSyncAt).toEqual(later)

    const hourLater = new Date(later.getTime() + 61 * 60_000)
    await syncMember({ store, google, now: hourLater }, FAM, 'bob', tokens)
    expect(store.writes).toBe(3)
    expect((store.status.get(`${FAM}/bob`) as { lastSyncAt: Date }).lastSyncAt).toEqual(hourLater)
  })

  it('skips re-reading stored events when Google returns the same, except for a daily full check', async () => {
    await store.saveTokens(FAM, 'bob', tokens)
    const dentist = (summary: string, hour: number): GoogleEvent => ({
      id: 'e1',
      summary,
      start: { dateTime: `2026-10-02T${hour}:00:00Z` },
      end: { dateTime: `2026-10-02T${hour + 1}:00:00Z` },
    })
    const google = stubGoogle({ listCalendars: vi.fn(async () => [PRIMARY]), listEvents: vi.fn(async () => [dentist('Dentist', 15)]) })
    const run = (now: Date) => syncMember({ store, google, now }, FAM, 'bob', store.tokens.get(store.key(FAM, 'bob')) as StoredTokens)
    await run(NOW)
    expect(store.eventReads).toBe(1)
    await run(new Date(NOW.getTime() + 15 * 60_000))
    expect(store.eventReads).toBe(1) // unchanged at Google: no reads of stored events
    await run(new Date('2026-10-02T09:05:00Z'))
    expect(store.eventReads).toBe(2) // the daily full check
    google.listEvents = vi.fn(async () => [dentist('Dentist (moved)', 17)])
    const r = await run(new Date('2026-10-02T10:00:00Z'))
    expect(store.eventReads).toBe(3)
    expect(r.upserted).toBe(1)
    expect([...store.events.values()].map((e) => e.title)).toEqual(['Dentist (moved)'])
  })

  it('asks Google for 30 days back through 120 days ahead, per calendar', async () => {
    const google = stubGoogle()
    await syncMember({ store, google, now: NOW }, FAM, 'bob', tokens)
    expect(google.listCalendars).toHaveBeenCalledWith('rt')
    expect(google.listEvents).toHaveBeenCalledWith('rt', PRIMARY.id, new Date('2026-09-01T12:00:00Z'), new Date('2027-01-29T12:00:00Z'))
  })

  it('syncs every calendar that is checked in Google, and records each one', async () => {
    const google = stubGoogle({
      listCalendars: vi.fn(async () => [PRIMARY, WORK, HOLIDAYS]),
      listEvents: vi.fn(async (_rt: string, calId: string) => (calId === WORK.id ? [allDay('w1', 'PAS-X Regional')] : calId === PRIMARY.id ? [timed('p1')] : [allDay('h1', 'Holiday')])),
    })
    await syncMember({ store, google, now: NOW }, FAM, 'bob', tokens)

    // Holidays isn't checked in Google, so it starts hidden and isn't fetched.
    expect(google.listEvents).toHaveBeenCalledTimes(2)
    expect(store.events.get(eventDocId(workKey, 'w1'))).toMatchObject({ title: 'PAS-X Regional', allDay: true, calendarKey: workKey })
    const cals = await store.listCalendars(FAM, 'bob')
    expect(cals.map((c) => [c.name, c.enabled, c.color])).toEqual([
      ['Bob', true, '#039be5'],
      ['Work', true, '#9e69af'],
      ['Holidays in United States', false, '#0b8043'],
    ])
  })

  it('keeps the family’s choices when the calendar list is refreshed, and drops removed calendars', async () => {
    await store.upsertCalendars(FAM, [
      { key: workKey, ownerId: 'bob', calendarId: WORK.id, name: 'Old name', googleColor: '#000000', primary: false, enabled: false, color: '#0f766e', memberIds: ['bob', 'alice'], alias: 'Office' },
      { key: calendarKey('bob', 'gone@group'), ownerId: 'bob', calendarId: 'gone@group', name: 'Gone', googleColor: '#000000', primary: false, enabled: true, color: '#000000', memberIds: ['bob'] },
    ])
    const google = stubGoogle({ listCalendars: vi.fn(async () => [PRIMARY, WORK]) })
    await syncMember({ store, google, now: NOW }, FAM, 'bob', tokens)

    const work = (await store.listCalendars(FAM, 'bob')).find((c) => c.key === workKey)
    expect(work).toMatchObject({ name: 'Work', googleColor: '#9e69af', enabled: false, color: '#0f766e', memberIds: ['bob', 'alice'], alias: 'Office' })
    expect(google.listEvents).not.toHaveBeenCalledWith('rt', WORK.id, expect.anything(), expect.anything())
    expect(store.calendars.has(calendarKey('bob', 'gone@group'))).toBe(false)
  })

  it('leaves calendar links (.ics) alone, even when the person who added one syncs or disconnects Google', async () => {
    const link = { key: 'ics_abc', kind: 'ics' as const, ownerId: 'bob', calendarId: 'https://school.example.org/cal.ics', name: 'School', googleColor: '#0f766e', primary: false, enabled: true, color: '#0f766e', memberIds: ['bob'] }
    await store.upsertCalendars(FAM, [link])
    await syncMember({ store, google: stubGoogle({ listCalendars: vi.fn(async () => [PRIMARY]) }), now: NOW }, FAM, 'bob', tokens)
    expect(store.calendars.get('ics_abc')).toEqual(link)
    await disconnectCalendar({ store, google: stubGoogle() }, 'bob', { familyId: FAM })
    expect(store.calendars.has('ics_abc')).toBe(true)
  })

  it('skips working-location markers', async () => {
    const google = stubGoogle({ listEvents: vi.fn(async () => [{ ...allDay('wl', 'Home'), eventType: 'workingLocation' }, timed('real')]) })
    const result = await syncMember({ store, google, now: NOW }, FAM, 'bob', tokens)
    expect(result.upserted).toBe(1)
  })

  it('marks the person as needing to reconnect when the token is dead, keeping existing events', async () => {
    store.events.set('g_bob_e1', { source: 'google', sourceUserId: 'bob' } as EventDoc)
    const google = stubGoogle({ listCalendars: vi.fn(async () => Promise.reject(invalidGrant())) })

    const result = await syncMember({ store, google, now: NOW }, FAM, 'bob', tokens)

    expect(result.status).toBe('needs_reconnect')
    expect(store.events.has('g_bob_e1')).toBe(true)
    expect(store.status.get(`${FAM}/bob`)).toMatchObject({ status: 'needs_reconnect', email: 'bob@example.com' })
  })

  it('rethrows other errors', async () => {
    const google = stubGoogle({ listEvents: vi.fn(async () => Promise.reject(new Error('500 backend error'))) })
    await expect(syncMember({ store, google, now: NOW }, FAM, 'bob', tokens)).rejects.toThrow('500')
  })
})

describe('mergeCalendars', () => {
  it('falls back to a neutral color when Google sends none', () => {
    const { keep } = mergeCalendars('bob', [{ id: 'x', summary: 'X', selected: true }], [])
    expect(keep[0]).toMatchObject({ enabled: true, color: '#57534e', memberIds: ['bob'] })
  })
})

describe('connectCalendar', () => {
  it('stores the refresh token and does a first sync', async () => {
    const google = stubGoogle({ listEvents: vi.fn(async () => [timed('e1')]) })
    const result = await connectCalendar({ store, google, now: NOW }, 'bob', { familyId: FAM, code: 'auth-code' })

    expect(google.exchangeCode).toHaveBeenCalledWith('auth-code')
    expect(store.tokens.get(`${FAM}/bob`)).toEqual({ refreshToken: 'rt-new', email: 'bob@example.com', scope: SCOPES, syncDigest: expect.any(String) })
    expect(result).toMatchObject({ email: 'bob@example.com', upserted: 1, status: 'connected' })
  })

  it('rejects callers who are signed out or not in the family', async () => {
    const google = stubGoogle()
    await expect(connectCalendar({ store, google }, undefined, { familyId: FAM, code: 'c' })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(connectCalendar({ store, google }, 'mallory', { familyId: FAM, code: 'c' })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(connectCalendar({ store, google }, 'bob', { familyId: FAM })).rejects.toMatchObject({ code: 'invalid-argument' })
    expect(google.exchangeCode).not.toHaveBeenCalled()
  })

  it('refuses when the calendar scope was unticked on the consent screen', async () => {
    const google = stubGoogle({ exchangeCode: vi.fn(async () => ({ refreshToken: 'rt', email: 'bob@example.com', scope: 'openid email' })) })
    await expect(connectCalendar({ store, google }, 'bob', { familyId: FAM, code: 'c' })).rejects.toBeInstanceOf(CalendarError)
    expect(store.tokens.size).toBe(0)
  })

  it('keeps the existing refresh token when Google omits a new one for the same account', async () => {
    store.tokens.set(`${FAM}/bob`, { refreshToken: 'rt-old', email: 'bob@example.com', scope: SCOPES })
    const google = stubGoogle({ exchangeCode: vi.fn(async () => ({ email: 'bob@example.com', scope: SCOPES })) })
    await connectCalendar({ store, google, now: NOW }, 'bob', { familyId: FAM, code: 'c' })
    expect(store.tokens.get(`${FAM}/bob`)?.refreshToken).toBe('rt-old')
    expect(google.listEvents).toHaveBeenCalledWith('rt-old', PRIMARY.id, expect.any(Date), expect.any(Date))
  })

  it('explains how to fix it when there is no refresh token at all', async () => {
    const google = stubGoogle({ exchangeCode: vi.fn(async () => ({ email: 'bob@example.com', scope: SCOPES })) })
    await expect(connectCalendar({ store, google }, 'bob', { familyId: FAM, code: 'c' })).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('myaccount.google.com/connections'),
    })
  })
})

describe('syncMine', () => {
  it('syncs the caller, or says nothing is connected', async () => {
    const google = stubGoogle()
    await expect(syncMine({ store, google }, 'bob', { familyId: FAM })).rejects.toMatchObject({ code: 'failed-precondition' })
    store.tokens.set(`${FAM}/bob`, { refreshToken: 'rt', email: 'bob@example.com', scope: SCOPES })
    await expect(syncMine({ store, google, now: NOW }, 'bob', { familyId: FAM })).resolves.toMatchObject({ status: 'connected' })
  })
})

describe('disconnectCalendar', () => {
  it('revokes, forgets the token, removes only this person’s synced events, and clears status', async () => {
    store.tokens.set(`${FAM}/bob`, { refreshToken: 'rt', email: 'bob@example.com', scope: SCOPES })
    store.events.set('g_bob_e1', { source: 'google', sourceUserId: 'bob' } as EventDoc)
    store.events.set('g_alice_e1', { source: 'google', sourceUserId: 'alice' } as EventDoc)
    const google = stubGoogle({ revoke: vi.fn(async () => Promise.reject(new Error('already revoked'))) })

    await disconnectCalendar({ store, google }, 'bob', { familyId: FAM })

    expect(google.revoke).toHaveBeenCalledWith('rt')
    expect(store.tokens.size).toBe(0)
    expect([...store.events.keys()]).toEqual(['g_alice_e1'])
    expect(store.status.get(`${FAM}/bob`)).toBeNull()
  })
})

describe('syncAll', () => {
  it('syncs everyone and keeps going past failures', async () => {
    store.tokens.set(`${FAM}/bob`, { refreshToken: 'rt-bob', email: 'b@x.com', scope: SCOPES })
    store.tokens.set(`${FAM}/alice`, { refreshToken: 'rt-alice', email: 'a@x.com', scope: SCOPES })
    store.tokens.set(`fam2/carol`, { refreshToken: 'rt-carol', email: 'c@x.com', scope: SCOPES })
    const google = stubGoogle({
      listCalendars: vi.fn(async (rt: string) => {
        if (rt === 'rt-alice') throw invalidGrant()
        if (rt === 'rt-carol') throw new Error('boom')
        return [PRIMARY]
      }),
      listEvents: vi.fn(async () => [timed('e1')]),
    })
    const log = vi.fn()

    expect(await syncAll({ store, google, now: NOW, log })).toEqual({ synced: 1, needsReconnect: 1, failed: 1 })
    expect(log).toHaveBeenCalledWith('calendar sync failed', expect.objectContaining({ uid: 'carol' }))
  })
})

describe('googleErrorDetail', () => {
  it('reads OAuth token-endpoint errors', () => {
    const err = Object.assign(new Error('Request failed'), { response: { data: { error: 'unauthorized_client', error_description: 'Unauthorized' } } })
    expect(googleErrorDetail(err)).toBe('unauthorized_client: Unauthorized')
  })

  it('reads Google API errors', () => {
    const err = Object.assign(new Error('403'), { response: { data: { error: { message: 'Google Calendar API has not been used in project 1 before or it is disabled.' } } } })
    expect(googleErrorDetail(err)).toBe('Google Calendar API has not been used in project 1 before or it is disabled.')
  })

  it('falls back to the message and truncates long ones', () => {
    expect(googleErrorDetail(new Error('boom'))).toBe('boom')
    expect(googleErrorDetail(new Error('x'.repeat(400)))).toHaveLength(300)
  })
})
