import { describe, expect, it, vi } from 'vitest'
import { deleteHousehold, listHouseholds, measureFiles, removeMember, renameHousehold, setCreator, type AdminStore, type HouseholdSummary } from './admin.js'

const h = (id: string, createdAt: string | null): HouseholdSummary => ({
  id,
  name: id,
  ownerEmail: null,
  createdAt,
  members: 1,
  people: [],
  events: 0,
  recipes: 0,
  photos: 0,
  photoBytes: 0,
  cookbookBytes: 0,
  otherBytes: 0,
})

const ADMIN = { uid: 'me', email: 'AndrewJacon15@gmail.com', emailVerified: true }

function fakeStore(): AdminStore & { renamed: string[]; removed: string[]; gone: string[]; allowed: string[] } {
  const names: Record<string, string> = { a: 'The Smiths', mine: 'Our House' }
  const renamed: string[] = []
  const removed: string[] = []
  const gone: string[] = []
  let allowed = ['kim@example.com']
  return {
    renamed,
    removed,
    gone,
    get allowed() {
      return allowed
    },
    householdOwner: async (id) => (names[id] ? (id === 'a' ? 'sam' : 'me') : undefined),
    searchesThisMonth: async (month) => (month === '2026-10' ? 412 : 0),
    creators: async () => allowed,
    setCreators: async (list) => void (allowed = list),
    member: async (id, uid) => (id === 'a' && ['sam', 'pat'].includes(uid) ? { email: `${uid}@example.com` } : null),
    removeMember: async (id, uid) => void gone.push(`${id}:${uid}`),
    admins: async () => ['andrewjacon15@gmail.com'],
    households: async () => [h('b', '2026-10-02T00:00:00Z'), h('a', '2026-09-27T00:00:00Z')],
    householdName: async (id) => names[id] ?? null,
    isMember: async (id, uid) => id === 'mine' && uid === 'me',
    rename: vi.fn(async (id: string, name: string) => void renamed.push(`${id}:${name}`)),
    remove: vi.fn(async (id: string) => void removed.push(id)),
  }
}

describe('admin households', () => {
  it('lists households, oldest first, for the admin', async () => {
    const r = await listHouseholds(fakeStore(), ADMIN, new Date('2026-10-09T12:00:00Z'), 900)
    expect(r.households.map((x) => x.id)).toEqual(['a', 'b'])
    expect(r.app).toEqual({ searches: 412, searchCap: 900, creators: ['kim@example.com'] })
  })

  it('refuses everyone else, unverified emails, and signed-out callers', async () => {
    const store = fakeStore()
    await expect(listHouseholds(store, { uid: 'u', email: 'friend@example.com', emailVerified: true })).rejects.toThrow(/administrator/)
    await expect(listHouseholds(store, { uid: 'u', email: 'andrewjacon15@gmail.com', emailVerified: false })).rejects.toThrow(/administrator/)
    await expect(listHouseholds(store, {})).rejects.toThrow(/Sign in/)
    await expect(deleteHousehold(store, { uid: 'u', email: 'friend@example.com', emailVerified: true }, { familyId: 'a', confirm: 'The Smiths' })).rejects.toThrow(/administrator/)
    expect(store.removed).toEqual([])
  })

  it('renames a household', async () => {
    const store = fakeStore()
    await renameHousehold(store, ADMIN, { familyId: 'a', name: '  The Smith Family ' })
    expect(store.renamed).toEqual(['a:The Smith Family'])
    await expect(renameHousehold(store, ADMIN, { familyId: 'a', name: ' ' })).rejects.toThrow(/name/)
    await expect(renameHousehold(store, ADMIN, { familyId: 'gone', name: 'X' })).rejects.toThrow(/no longer exists/)
    await expect(renameHousehold(store, ADMIN, { familyId: '../x', name: 'X' })).rejects.toThrow(/Which household/)
  })

  it('deletes a household only when its name is typed, and never your own', async () => {
    const store = fakeStore()
    await expect(deleteHousehold(store, ADMIN, { familyId: 'a', confirm: 'Smiths' })).rejects.toThrow(/Type the household’s name/)
    await expect(deleteHousehold(store, ADMIN, { familyId: 'mine', confirm: 'Our House' })).rejects.toThrow(/You belong/)
    expect(store.removed).toEqual([])
    await deleteHousehold(store, ADMIN, { familyId: 'a', confirm: 'the smiths ' })
    expect(store.removed).toEqual(['a'])
  })

  it('measures stored files: photos with thumbnails, cookbooks, and the rest', () => {
    const m = measureFiles('f1', [
      { name: 'families/f1/photos/p1.jpg', size: 900 },
      { name: 'families/f1/photos/p1_thumb.jpg', size: 100 },
      { name: 'families/f1/photos/v2.mp4', size: 5000 },
      { name: 'families/f1/cookbooks/b1/original.pdf', size: 7000 },
      { name: 'families/f1/cookbooks/b1/cover.jpg', size: 50 },
      { name: 'families/f1/other/x', size: 3 },
      { name: 'families/f10/photos/p9.jpg', size: 999 },
    ])
    expect(m).toMatchObject({ photoBytes: 6000, cookbookBytes: 7050, otherBytes: 3 })
    expect(m.photoSizes.get('p1')).toBe(1000)
    expect(m.photoSizes.get('v2')).toBe(5000)
    expect(m.photoSizes.has('p9')).toBe(false)
  })

  it('adds and removes people who may start a household', async () => {
    const store = fakeStore()
    expect((await setCreator(store, ADMIN, { email: ' Pat@Example.com ', allow: true })).creators).toEqual(['kim@example.com', 'pat@example.com'])
    expect((await setCreator(store, ADMIN, { email: 'kim@example.com', allow: false })).creators).toEqual(['pat@example.com'])
    await expect(setCreator(store, ADMIN, { email: 'not an email', allow: true })).rejects.toThrow(/email address/)
  })

  it('removes a person from a household, but never its owner or you', async () => {
    const store = fakeStore()
    await removeMember(store, ADMIN, { familyId: 'a', uid: 'pat' })
    expect(store.gone).toEqual(['a:pat'])
    await expect(removeMember(store, ADMIN, { familyId: 'a', uid: 'sam' })).rejects.toThrow(/owner/)
    await expect(removeMember(store, ADMIN, { familyId: 'a', uid: 'me' })).rejects.toThrow(/yourself/)
    await expect(removeMember(store, ADMIN, { familyId: 'a', uid: 'nobody' })).rejects.toThrow(/no longer in/)
  })
})
