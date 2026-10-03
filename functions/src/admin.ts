// The app administrator's view of every household: names and sizes, never contents.
// Admins are listed in config/access.admins (lowercase emails), managed with admin credentials only.
import { CalendarError } from './calendar.js'

export interface HouseholdSummary {
  id: string
  name: string
  ownerEmail: string | null
  createdAt: string | null
  members: number
  events: number
  recipes: number
  photos: number
  photoBytes: number
  cookbookBytes: number
}

export interface AdminStore {
  admins(): Promise<string[]>
  households(): Promise<HouseholdSummary[]>
}

export interface Caller {
  uid?: string
  email?: string
  emailVerified?: boolean
}

export async function requireAdmin(store: AdminStore, caller: Caller) {
  if (!caller.uid) throw new CalendarError('permission-denied', 'Sign in first.')
  const email = caller.email?.toLowerCase()
  if (!email || !caller.emailVerified || !(await store.admins()).includes(email)) {
    throw new CalendarError('permission-denied', 'Only the app’s administrator can see this.')
  }
}

export async function listHouseholds(store: AdminStore, caller: Caller) {
  await requireAdmin(store, caller)
  const households = await store.households()
  households.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
  return { households }
}
