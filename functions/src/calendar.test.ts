import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CALENDAR_SCOPE, CalendarError, connectCalendar, disconnectCalendar, googleErrorDetail, syncAll, syncMember, syncMine } from './calendar.js'
import type { CalendarStatus, CalendarStore, EventDoc, GoogleApi, GoogleEvent, StoredTokens } from './types.js'

const NOW = new Date('2026-10-01T12:00:00Z')
const FAM = 'fam1'
const SCOPES = `openid email ${CALENDAR_SCOPE}`

/** In-memory stand-in for Firestore. */
class FakeStore implements CalendarStore {
  members = new Set<string>()
  tokens = new Map<string, StoredTokens>()
  events = new Map<string, EventDoc>()
  status = new Map<string, CalendarStatus | null>()
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
  async upsertEvents(_f: string, events: { id: string; data: EventDoc }[]) {
    for (const { id, data } of events) this.events.set(id, data)
  }
  async deleteEvents(_f: string, ids: string[]) {
    for (const id of ids) this.events.delete(id)
  }
  async setCalendarStatus(f: string, u: string, s: CalendarStatus | null) {
    this.status.set(this.key(f, u), s)
  }
}

function stubGoogle(overrides: Partial<GoogleApi> = {}) {
  return {
    exchangeCode: vi.fn<GoogleApi['exchangeCode']>(async () => ({ refreshToken: 'rt-new', email: 'bob@example.com', scope: SCOPES })),
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

const invalidGrant = () => Object.assign(new Error('invalid_grant'), { response: { data: { error: 'invalid_grant' } } })

let store: FakeStore
beforeEach(() => {
  store = new FakeStore()
  store.members.add(`${FAM}/bob`)
})

describe('syncMember', () => {
  const tokens = { refreshToken: 'rt', email: 'bob@example.com', scope: SCOPES }

  it('mirrors events, removes ones deleted in Google, and records status', async () => {
    store.events.set('g_bob_gone', { ...({} as EventDoc), source: 'google', sourceUserId: 'bob' })
    store.events.set('g_alice_keep', { ...({} as EventDoc), source: 'google', sourceUserId: 'alice' })
    const google = stubGoogle({ listEvents: vi.fn(async () => [timed('e1'), timed('e2'), { id: 'e3', status: 'cancelled' }]) })

    const result = await syncMember({ store, google, now: NOW }, FAM, 'bob', tokens)

    expect(result).toEqual({ upserted: 2, deleted: 1, status: 'connected' })
    expect([...store.events.keys()].sort()).toEqual(['g_alice_keep', 'g_bob_e1', 'g_bob_e2'])
    expect(store.status.get(`${FAM}/bob`)).toEqual({ status: 'connected', email: 'bob@example.com', lastSyncAt: NOW, eventCount: 2 })
  })

  it('asks Google for 30 days back through 120 days ahead with the stored refresh token', async () => {
    const google = stubGoogle()
    await syncMember({ store, google, now: NOW }, FAM, 'bob', tokens)
    expect(google.listEvents).toHaveBeenCalledWith('rt', new Date('2026-09-01T12:00:00Z'), new Date('2027-01-29T12:00:00Z'))
  })

  it('marks the person as needing to reconnect when the token is dead, keeping existing events', async () => {
    store.events.set('g_bob_e1', { source: 'google', sourceUserId: 'bob' } as EventDoc)
    const google = stubGoogle({ listEvents: vi.fn(async () => Promise.reject(invalidGrant())) })

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

describe('connectCalendar', () => {
  it('stores the refresh token and does a first sync', async () => {
    const google = stubGoogle({ listEvents: vi.fn(async () => [timed('e1')]) })
    const result = await connectCalendar({ store, google, now: NOW }, 'bob', { familyId: FAM, code: 'auth-code' })

    expect(google.exchangeCode).toHaveBeenCalledWith('auth-code')
    expect(store.tokens.get(`${FAM}/bob`)).toEqual({ refreshToken: 'rt-new', email: 'bob@example.com', scope: SCOPES })
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
    expect(google.listEvents).toHaveBeenCalledWith('rt-old', expect.any(Date), expect.any(Date))
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
      listEvents: vi.fn(async (rt: string) => {
        if (rt === 'rt-alice') throw invalidGrant()
        if (rt === 'rt-carol') throw new Error('boom')
        return [timed('e1')]
      }),
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
