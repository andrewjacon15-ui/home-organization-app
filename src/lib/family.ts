import type { User } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Family, Invite, Member } from '../types'
import { PERSON_COLORS } from './colors'
import { detectTimezone } from './dates'

const MEMBER_COLORS = PERSON_COLORS.map((c) => c.hex.toLowerCase())

function emailKey(user: User): string {
  if (!user.email) throw new Error('Your Google account has no email address.')
  return user.email.toLowerCase()
}

/** An invitation this person hasn't answered yet. Names are missing on invites made before they were recorded. */
export interface PendingInvite {
  familyId: string
  familyName?: string
  inviterName?: string
}

/**
 * This user's family: its id when they're in one, the invitation when they've been invited
 * but haven't joined (they're asked first: see JoinHousehold), or null when there's neither,
 * meaning they can start a new family.
 */
export async function resolveFamily(user: User): Promise<string | PendingInvite | null> {
  const invite = await getDoc(doc(db, 'invites', emailKey(user)))
  if (!invite.exists()) return null
  const { familyId, familyName, inviterName } = invite.data() as Invite
  const member = await getDoc(doc(db, 'families', familyId, 'members', user.uid))
  if (member.exists()) return familyId
  return { familyId, ...(familyName ? { familyName } : {}), ...(inviterName ? { inviterName } : {}) }
}

/** Accepts an invitation: adds this person to the household. */
export async function joinFamily(user: User, familyId: string): Promise<string> {
  await setDoc(doc(db, 'families', familyId, 'members', user.uid), {
    displayName: (user.displayName ?? user.email ?? 'Someone').slice(0, 100),
    email: emailKey(user),
    color: MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)],
    photoURL: user.photoURL ?? '',
    joinedAt: serverTimestamp(),
  })
  return familyId
}

/** Turns an invitation down: it's removed, so this account can be invited elsewhere or start its own household. */
export async function declineInvite(user: User) {
  await deleteDoc(doc(db, 'invites', emailKey(user)))
}

/**
 * Creates a family owned by this user, with them as its first member. With a household
 * invite code, the same batch marks the invite used (firestore.rules → redeemsInvite).
 */
export async function createFamily(user: User, name: string, inviteCode?: string): Promise<string> {
  const familyRef = doc(collection(db, 'families'))
  const batch = writeBatch(db)
  batch.set(familyRef, {
    name,
    ownerId: user.uid,
    timezone: detectTimezone(),
    createdAt: serverTimestamp(),
    ...(inviteCode ? { inviteCode } : {}),
  })
  if (inviteCode) {
    batch.update(doc(db, 'householdInvites', inviteCode), {
      usedBy: user.uid,
      usedEmail: emailKey(user),
      usedAt: serverTimestamp(),
      familyId: familyRef.id,
    })
  }
  batch.set(doc(db, 'families', familyRef.id, 'members', user.uid), {
    displayName: user.displayName ?? user.email ?? 'Me',
    email: emailKey(user),
    color: MEMBER_COLORS[0],
    photoURL: user.photoURL ?? '',
    joinedAt: serverTimestamp(),
  })
  batch.set(doc(db, 'invites', emailKey(user)), {
    familyId: familyRef.id,
    invitedBy: user.uid,
    createdAt: serverTimestamp(),
  })
  await batch.commit()
  return familyRef.id
}

export function watchFamily(familyId: string, onChange: (family: Family | null) => void) {
  return onSnapshot(doc(db, 'families', familyId), (snap) => {
    onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as Family) : null)
  })
}

/**
 * Whether this device is in touch with the server: false while it only has its saved copy
 * (no internet, or the server can't be reached). Costs no reads: only the snapshot's metadata changes.
 */
export function watchServerReach(familyId: string, onChange: (reached: boolean) => void) {
  return onSnapshot(
    doc(db, 'families', familyId),
    { includeMetadataChanges: true },
    (snap) => onChange(!snap.metadata.fromCache),
    () => onChange(false),
  )
}

/** The welcome tour is done for this person, on every device. */
export function markWelcomed(familyId: string, userId: string) {
  return updateDoc(doc(db, 'families', familyId, 'members', userId), { welcomedAt: serverTimestamp() })
}

export function watchMembers(familyId: string, onChange: (members: Member[]) => void) {
  return onSnapshot(collection(db, 'families', familyId, 'members'), (snap) => {
    const members = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Member)
    members.sort((a, b) => a.displayName.localeCompare(b.displayName))
    onChange(members)
  })
}

export function watchInvites(familyId: string, onChange: (invites: Invite[]) => void) {
  const q = query(collection(db, 'invites'), where('familyId', '==', familyId))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ email: d.id, ...d.data() }) as Invite))
  })
}

/** Invites someone by email. The household's and inviter's names go with it, so the person can see what they're joining. */
export async function inviteMember(familyId: string, invitedBy: string, email: string, names: { familyName?: string; inviterName?: string } = {}) {
  const key = email.trim().toLowerCase()
  const existing = await getDoc(doc(db, 'invites', key)).catch(() => null)
  if (existing?.exists()) throw new Error(`${key} is already invited.`)
  const familyName = names.familyName?.trim().slice(0, 100)
  const inviterName = names.inviterName?.trim().slice(0, 100)
  await setDoc(doc(db, 'invites', key), { familyId, invitedBy, createdAt: serverTimestamp(), ...(familyName ? { familyName } : {}), ...(inviterName ? { inviterName } : {}) })
}

export async function removeInvite(email: string) {
  await deleteDoc(doc(db, 'invites', email))
}

export async function updateFamily(familyId: string, changes: Partial<Pick<Family, 'name' | 'timezone'>>) {
  await updateDoc(doc(db, 'families', familyId), changes)
}

export async function updateMember(familyId: string, userId: string, changes: Partial<Pick<Member, 'displayName' | 'color'>>) {
  await updateDoc(doc(db, 'families', familyId, 'members', userId), changes)
}
