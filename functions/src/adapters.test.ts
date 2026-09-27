import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Google libraries, mocked so nothing hits the network ---
const getToken = vi.fn()
const verifyIdToken = vi.fn()
const revokeToken = vi.fn()
const setCredentials = vi.fn()
const eventsList = vi.fn()

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn(function (this: object) {
    Object.assign(this, { getToken, verifyIdToken, revokeToken, setCredentials })
  }),
}))
vi.mock('@googleapis/calendar', () => ({
  calendar: vi.fn(() => ({ events: { list: eventsList } })),
}))

// --- firebase-admin FieldValue, mocked; Firestore itself is a hand-rolled fake below ---
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TS', delete: () => 'DELETE' },
}))

const { googleApi } = await import('./google.js')
const { firestoreStore } = await import('./store.js')
const { OAuth2Client } = await import('google-auth-library')

beforeEach(() => vi.clearAllMocks())

describe('googleApi', () => {
  const api = googleApi('client-id', 'secret')

  it('exchanges a popup code with the postmessage redirect and reads the verified email', async () => {
    getToken.mockResolvedValue({ tokens: { refresh_token: 'rt', id_token: 'idt', scope: 'openid email cal' } })
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'Bob@Example.com' }) })

    await expect(api.exchangeCode('code')).resolves.toEqual({ refreshToken: 'rt', email: 'bob@example.com', scope: 'openid email cal' })
    expect(OAuth2Client).toHaveBeenCalledWith({ clientId: 'client-id', clientSecret: 'secret', redirectUri: 'postmessage' })
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'idt', audience: 'client-id' })
  })

  it('fails clearly without an ID token', async () => {
    getToken.mockResolvedValue({ tokens: { refresh_token: 'rt' } })
    await expect(api.exchangeCode('code')).rejects.toThrow('ID token')
  })

  it('pages through the primary calendar with recurring events expanded', async () => {
    eventsList
      .mockResolvedValueOnce({ data: { items: [{ id: '1' }], nextPageToken: 'p2' } })
      .mockResolvedValueOnce({ data: { items: [{ id: '2' }] } })
    const min = new Date('2026-09-01T00:00:00Z')
    const max = new Date('2027-01-01T00:00:00Z')

    await expect(api.listEvents('rt', min, max)).resolves.toEqual([{ id: '1' }, { id: '2' }])
    expect(setCredentials).toHaveBeenCalledWith({ refresh_token: 'rt' })
    expect(eventsList).toHaveBeenNthCalledWith(1, expect.objectContaining({ calendarId: 'primary', singleEvents: true, timeMin: min.toISOString(), pageToken: undefined }))
    expect(eventsList).toHaveBeenNthCalledWith(2, expect.objectContaining({ pageToken: 'p2' }))
  })

  it('revokes', async () => {
    await api.revoke('rt')
    expect(revokeToken).toHaveBeenCalledWith('rt')
  })
})

describe('firestoreStore', () => {
  /** Minimal fake of the Admin Firestore surface store.ts uses. */
  function fakeDb() {
    const writes: { op: string; path: string; data?: unknown }[] = []
    const docs = new Map<string, Record<string, unknown>>()
    const docRef = (path: string) => ({
      path,
      id: path.split('/').pop(),
      get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
      set: async (data: unknown) => void writes.push({ op: 'set', path, data }),
      update: async (data: unknown) => void writes.push({ op: 'update', path, data }),
      delete: async () => void writes.push({ op: 'delete', path }),
    })
    let batches = 0
    const db = {
      doc: docRef,
      collection: (path: string) => ({ doc: (id: string) => docRef(`${path}/${id}`) }),
      collectionGroup: () => ({
        get: async () => ({
          docs: [...docs]
            .filter(([p]) => p.split('/').at(-2) === 'private')
            .map(([p, data]) => ({ id: p.split('/').pop(), ref: { path: p }, data: () => data })),
        }),
      }),
      batch: () => {
        batches++
        return {
          set: (ref: { path: string }, data: unknown) => writes.push({ op: 'set', path: ref.path, data }),
          delete: (ref: { path: string }) => writes.push({ op: 'delete', path: ref.path }),
          commit: async () => undefined,
        }
      },
    }
    return { db, docs, writes, batches: () => batches }
  }

  it('keeps tokens under private/tokens and parses them back out for the scheduler', async () => {
    const { db, docs, writes } = fakeDb()
    const store = firestoreStore(db as never)
    await store.saveTokens('f1', 'u1', { refreshToken: 'rt', email: 'e', scope: 's' })
    expect(writes[0]).toEqual({ op: 'set', path: 'families/f1/members/u1/private/tokens', data: { refreshToken: 'rt', email: 'e', scope: 's', updatedAt: 'SERVER_TS' } })

    docs.set('families/f1/members/u1/private/tokens', { refreshToken: 'rt', email: 'e', scope: 's', updatedAt: 1 })
    docs.set('families/f1/members/u1/private/other', { x: 1 })
    expect(await store.listConnected()).toEqual([{ familyId: 'f1', uid: 'u1', tokens: { refreshToken: 'rt', email: 'e', scope: 's' } }])
  })

  it('writes events in batches of at most 400', async () => {
    const { db, writes, batches } = fakeDb()
    const store = firestoreStore(db as never)
    const events = Array.from({ length: 450 }, (_, i) => ({ id: `g_u_${i}`, data: { title: `e${i}` } as never }))
    await store.upsertEvents('f1', events)
    expect(batches()).toBe(2)
    expect(writes).toHaveLength(450)
    expect(writes[0]).toEqual({ op: 'set', path: 'families/f1/events/g_u_0', data: { title: 'e0', updatedAt: 'SERVER_TS' } })
  })

  it('clears calendar status with a field delete', async () => {
    const { db, writes } = fakeDb()
    await firestoreStore(db as never).setCalendarStatus('f1', 'u1', null)
    expect(writes[0]).toEqual({ op: 'update', path: 'families/f1/members/u1', data: { calendar: 'DELETE' } })
  })
})
