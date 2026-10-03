import { collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../firebase'

/** householdInvites/{code}: a single-use link that lets someone start their own household. */
export interface HouseholdInvite {
  code: string
  note: string
  createdAt: Date | null
  expiresAt: Date
  usedBy?: string
  usedEmail?: string
  usedAt?: Date | null
  familyId?: string
}

export const INVITE_DAYS = 14
const PARAM = 'household'
const KEY = 'household-invite'
const col = collection(db, 'householdInvites')
const date = (v: unknown) => (v instanceof Timestamp ? v.toDate() : null)

export const inviteLink = (code: string, origin = window.location.origin) => `${origin}/?${PARAM}=${code}`

/** 24 random characters (about 143 bits): unguessable, and short enough to paste. */
export function newCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(random(24), (b) => alphabet[b % alphabet.length]).join('')
}

/** Picks up ?household=CODE from the address (and keeps it through Google sign-in). */
export function takeInviteFromUrl(loc: Location = window.location, history: History = window.history) {
  const code = new URLSearchParams(loc.search).get(PARAM)
  if (!code) return
  try {
    localStorage.setItem(KEY, code.trim())
  } catch {
    // Without storage the link still works if they sign in from the same page.
  }
  const url = new URL(loc.href)
  url.searchParams.delete(PARAM)
  history.replaceState(null, '', url.pathname + url.search + url.hash)
}

export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}

export type InviteState = 'valid' | 'used' | 'expired' | 'missing'

export async function checkInvite(code: string, now = new Date()): Promise<InviteState> {
  const snap = await getDoc(doc(col, code)).catch(() => null)
  if (!snap?.exists()) return 'missing'
  if (snap.get('usedBy')) return 'used'
  return (date(snap.get('expiresAt')) ?? new Date(0)) > now ? 'valid' : 'expired'
}

export async function createInvite(adminUid: string, note: string, now = new Date()): Promise<string> {
  const code = newCode()
  await setDoc(doc(col, code), {
    createdBy: adminUid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(now.getTime() + INVITE_DAYS * 86_400_000)),
    ...(note.trim() ? { note: note.trim().slice(0, 80) } : {}),
  })
  return code
}

export const revokeInvite = (code: string) => deleteDoc(doc(col, code))

export function watchInvites(onChange: (list: HouseholdInvite[]) => void) {
  return onSnapshot(query(col, orderBy('createdAt', 'desc')), (snap) =>
    onChange(
      snap.docs.map((d) => ({
        code: d.id,
        note: d.get('note') ?? '',
        createdAt: date(d.get('createdAt')),
        expiresAt: date(d.get('expiresAt')) ?? new Date(0),
        usedBy: d.get('usedBy'),
        usedEmail: d.get('usedEmail'),
        usedAt: date(d.get('usedAt')),
        familyId: d.get('familyId'),
      })),
    ),
  )
}

/** Only the admin may list invites, so a successful one-document read means "you're the admin". */
export async function amIAdmin(): Promise<boolean> {
  try {
    await getDocs(query(col, limit(1)))
    return true
  } catch {
    return false
  }
}

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

/** Every household's name and size (counts only, never contents). Admin only. */
export const fetchHouseholds = () =>
  httpsCallable<object, { households: HouseholdSummary[] }>(functions, 'adminHouseholds')({}).then((r) => r.data.households)
