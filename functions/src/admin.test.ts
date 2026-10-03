import { describe, expect, it } from 'vitest'
import { listHouseholds, type AdminStore, type HouseholdSummary } from './admin.js'

const h = (id: string, createdAt: string | null): HouseholdSummary => ({
  id,
  name: id,
  ownerEmail: null,
  createdAt,
  members: 1,
  events: 0,
  recipes: 0,
  photos: 0,
  photoBytes: 0,
  cookbookBytes: 0,
})

const store: AdminStore = {
  admins: async () => ['andrewjacon15@gmail.com'],
  households: async () => [h('b', '2026-10-02T00:00:00Z'), h('a', '2026-09-27T00:00:00Z')],
}

describe('admin households', () => {
  it('lists households, oldest first, for the admin', async () => {
    const r = await listHouseholds(store, { uid: 'u', email: 'AndrewJacon15@gmail.com', emailVerified: true })
    expect(r.households.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('refuses everyone else, unverified emails, and signed-out callers', async () => {
    await expect(listHouseholds(store, { uid: 'u', email: 'friend@example.com', emailVerified: true })).rejects.toThrow(/administrator/)
    await expect(listHouseholds(store, { uid: 'u', email: 'andrewjacon15@gmail.com', emailVerified: false })).rejects.toThrow(/administrator/)
    await expect(listHouseholds(store, {})).rejects.toThrow(/Sign in/)
  })
})
