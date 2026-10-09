// The app administrator's view of every household: names, people and sizes, never contents.
// Admins are listed in config/access.admins (lowercase emails), managed with admin credentials only.
import { CalendarError } from './calendar.js'

export interface HouseholdPerson {
  id: string
  name: string
  email: string | null
  owner: boolean
}

export interface HouseholdSummary {
  id: string
  name: string
  ownerEmail: string | null
  createdAt: string | null
  members: number
  people: HouseholdPerson[]
  events: number
  recipes: number
  photos: number
  /** Measured from the files in Cloud Storage (photos with their thumbnails, and videos). */
  photoBytes: number
  /** Cookbook files and their covers. */
  cookbookBytes: number
  /** Anything else in the household's folder. */
  otherBytes: number
}

export interface AdminStore {
  admins(): Promise<string[]>
  households(): Promise<HouseholdSummary[]>
  /** The household's name, or null when there's no such household. */
  householdName(familyId: string): Promise<string | null>
  /** The owner's id; undefined when there's no such household. */
  householdOwner(familyId: string): Promise<string | null | undefined>
  isMember(familyId: string, uid: string): Promise<boolean>
  rename(familyId: string, name: string): Promise<void>
  /** Deletes the household's documents, its files, and email invites to it. */
  remove(familyId: string): Promise<void>
  /** Online recipe searches used this month (all households together). */
  searchesThisMonth(month: string): Promise<number>
  /** Who may start a household without an invite link (config/access.familyCreators). */
  creators(): Promise<string[]>
  setCreators(emails: string[]): Promise<void>
  /** The member's record, or null. */
  member(familyId: string, uid: string): Promise<{ email: string | null } | null>
  /** Takes someone out of a household (their member record, saved tokens, and email invite). */
  removeMember(familyId: string, uid: string, email: string | null): Promise<void>
}

/** App-wide numbers for the Admin tab. */
export interface AppUsage {
  searches: number
  searchCap: number
  creators: string[]
}

export interface Caller {
  uid?: string
  email?: string
  emailVerified?: boolean
}

export async function requireAdmin(store: Pick<AdminStore, 'admins'>, caller: Caller) {
  if (!caller.uid) throw new CalendarError('permission-denied', 'Sign in first.')
  const email = caller.email?.toLowerCase()
  if (!email || !caller.emailVerified || !(await store.admins()).includes(email)) {
    throw new CalendarError('permission-denied', 'Only the app’s administrator can see this.')
  }
}

export async function listHouseholds(store: AdminStore, caller: Caller, now = new Date(), searchCap = 0) {
  await requireAdmin(store, caller)
  const [households, searches, creators] = await Promise.all([store.households(), store.searchesThisMonth(now.toISOString().slice(0, 7)), store.creators()])
  households.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
  const app: AppUsage = { searches, searchCap, creators: [...creators].sort() }
  return { households, app }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Adds or removes someone who may start a household without an invite link. */
export async function setCreator(store: AdminStore, caller: Caller, data: unknown) {
  await requireAdmin(store, caller)
  const email = String((data as { email?: unknown } | null)?.email ?? '').trim().toLowerCase()
  const allow = (data as { allow?: unknown } | null)?.allow === true
  if (!EMAIL.test(email) || email.length > 200) throw new CalendarError('invalid-argument', 'That doesn’t look like an email address.')
  const list = new Set(await store.creators())
  if (allow) list.add(email)
  else list.delete(email)
  if (list.size > 200) throw new CalendarError('failed-precondition', 'That list is full (200 people).')
  await store.setCreators([...list].sort())
  return { creators: [...list].sort() }
}

/** Takes a person out of another household. The owner stays; so do you. */
export async function removeMember(store: AdminStore, caller: Caller, data: unknown) {
  await requireAdmin(store, caller)
  const familyId = familyIdOf(data)
  const uid = String((data as { uid?: unknown }).uid ?? '')
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new CalendarError('invalid-argument', 'Which person?')
  if (uid === caller.uid) throw new CalendarError('failed-precondition', 'You can’t remove yourself from here.')
  const owner = await store.householdOwner(familyId)
  if (owner === undefined) throw new CalendarError('not-found', 'That household no longer exists.')
  if (owner === uid) throw new CalendarError('failed-precondition', 'The household’s owner can’t be removed.')
  const person = await store.member(familyId, uid)
  if (!person) throw new CalendarError('not-found', 'They’re no longer in that household.')
  await store.removeMember(familyId, uid, person.email)
  return { ok: true }
}

const familyIdOf = (data: unknown) => {
  const id = (data as { familyId?: unknown } | null)?.familyId
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new CalendarError('invalid-argument', 'Which household?')
  return id
}

export async function renameHousehold(store: AdminStore, caller: Caller, data: unknown) {
  await requireAdmin(store, caller)
  const familyId = familyIdOf(data)
  const name = String((data as { name?: unknown }).name ?? '').trim()
  if (!name || name.length > 80) throw new CalendarError('invalid-argument', 'Give the household a name (up to 80 characters).')
  if ((await store.householdName(familyId)) === null) throw new CalendarError('not-found', 'That household no longer exists.')
  await store.rename(familyId, name)
  return { ok: true }
}

/**
 * Deletes another household and everything in it. The admin must type its name to confirm,
 * and can't delete a household they belong to (that's done from inside it, by its owner).
 */
export async function deleteHousehold(store: AdminStore, caller: Caller, data: unknown) {
  await requireAdmin(store, caller)
  const familyId = familyIdOf(data)
  const name = await store.householdName(familyId)
  if (name === null) throw new CalendarError('not-found', 'That household no longer exists.')
  if (await store.isMember(familyId, caller.uid!)) throw new CalendarError('failed-precondition', 'You belong to this household, so it can’t be deleted from here.')
  const confirm = String((data as { confirm?: unknown }).confirm ?? '').trim()
  if (confirm.toLowerCase() !== name.trim().toLowerCase()) throw new CalendarError('invalid-argument', 'Type the household’s name exactly to delete it.')
  await store.remove(familyId)
  return { ok: true }
}

export interface StoredFile {
  name: string
  size: number
}

/**
 * Splits a household's files (everything under families/{id}/) into photos, cookbooks and
 * the rest, and finds each photo's stored size (the file plus its thumbnail) by its id.
 */
export function measureFiles(familyId: string, files: StoredFile[]) {
  const prefix = `families/${familyId}/`
  let photoBytes = 0
  let cookbookBytes = 0
  let otherBytes = 0
  const photoSizes = new Map<string, number>()
  for (const f of files) {
    if (!f.name.startsWith(prefix)) continue
    const [area, file] = f.name.slice(prefix.length).split('/')
    if (area === 'photos' && file) {
      photoBytes += f.size
      const id = file.replace(/_thumb\.jpg$/, '').replace(/\.[^.]+$/, '')
      photoSizes.set(id, (photoSizes.get(id) ?? 0) + f.size)
    } else if (area === 'cookbooks') cookbookBytes += f.size
    else otherBytes += f.size
  }
  return { photoBytes, cookbookBytes, otherBytes, photoSizes }
}
