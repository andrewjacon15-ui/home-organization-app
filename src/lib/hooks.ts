import { onAuthStateChanged, type User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth } from '../firebase'
import type { Family, Member } from '../types'
import { toDateKey } from './dates'
import { watchFamily, watchMembers } from './family'

/** undefined while Firebase is still restoring the session. */
export function useAuthUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  return user
}

export function useFamily(familyId: string) {
  const [family, setFamily] = useState<Family | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  useEffect(() => watchFamily(familyId, setFamily), [familyId])
  useEffect(() => watchMembers(familyId, setMembers), [familyId])
  return { family, members }
}

/** Current time, refreshed every `intervalMs`. The wall display runs for days, so dates must roll over. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function useToday(): string {
  return toDateKey(useNow())
}
