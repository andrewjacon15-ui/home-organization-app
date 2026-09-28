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

export const MEMBER_COLORS = PERSON_COLORS.map((c) => c.hex.toLowerCase())

export function pickColor(taken: string[]): string {
  return MEMBER_COLORS.find((c) => !taken.includes(c)) ?? MEMBER_COLORS[taken.length % MEMBER_COLORS.length]
}

function emailKey(user: User): string {
  if (!user.email) throw new Error('Your Google account has no email address.')
  return user.email.toLowerCase()
}

/**
 * Finds the family this user was invited to and joins it if they haven't yet.
 * Returns null when there's no invite, meaning they can start a new family.
 */
export async function resolveFamily(user: User): Promise<string | null> {
  const invite = await getDoc(doc(db, 'invites', emailKey(user)))
  if (!invite.exists()) return null
  const familyId = (invite.data() as Invite).familyId

  const memberRef = doc(db, 'families', familyId, 'members', user.uid)
  const member = await getDoc(memberRef)
  if (!member.exists()) {
    await setDoc(memberRef, {
      displayName: user.displayName ?? user.email ?? 'Someone',
      email: emailKey(user),
      color: MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)],
      photoURL: user.photoURL ?? '',
      joinedAt: serverTimestamp(),
    })
  }
  return familyId
}

/** Creates a family owned by this user, with them as its first member. */
export async function createFamily(user: User, name: string): Promise<string> {
  const familyRef = doc(collection(db, 'families'))
  const batch = writeBatch(db)
  batch.set(familyRef, {
    name,
    ownerId: user.uid,
    timezone: detectTimezone(),
    createdAt: serverTimestamp(),
  })
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

export async function inviteMember(familyId: string, invitedBy: string, email: string) {
  const key = email.trim().toLowerCase()
  const existing = await getDoc(doc(db, 'invites', key)).catch(() => null)
  if (existing?.exists()) throw new Error(`${key} is already invited.`)
  await setDoc(doc(db, 'invites', key), { familyId, invitedBy, createdAt: serverTimestamp() })
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
