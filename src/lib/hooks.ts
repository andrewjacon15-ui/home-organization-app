import { onAuthStateChanged, type User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth } from '../firebase'
import type { Family, Member } from '../types'
import { toDateKey } from './dates'
import { watchFamily, watchMembers, watchServerReach } from './family'

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

/** How long until the next multiple of `intervalMs` on the clock (a hair after, so it's surely past). */
export function untilNextTick(intervalMs: number, now = Date.now()): number {
  return intervalMs - (now % intervalMs) + 20
}

/**
 * Current time, refreshed every `intervalMs`. The wall display runs for days, so dates must roll over.
 * Ticks land on the clock (:00 and :30 for 30 s), so a clock showing minutes turns over on the
 * minute rather than up to 30 s late, and it catches up at once when a sleeping screen wakes.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      setNow(new Date())
      timer = setTimeout(tick, untilNextTick(intervalMs))
    }
    timer = setTimeout(tick, untilNextTick(intervalMs))
    const wake = () => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    document.addEventListener('visibilitychange', wake)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [intervalMs])
  return now
}

export function useToday(): string {
  return toDateKey(useNow())
}

/**
 * True while this device is cut off: the browser says it's offline, or it has gone `graceMs`
 * without reaching the server (Wi-Fi up but no internet). Changes made meanwhile wait on the
 * device and go out when it's back.
 */
export function useOffline(familyId: string, graceMs = 15_000): boolean {
  const [netDown, setNetDown] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  const [cut, setCut] = useState(false)
  useEffect(() => {
    const down = () => setNetDown(true)
    const up = () => setNetDown(false)
    window.addEventListener('offline', down)
    window.addEventListener('online', up)
    return () => {
      window.removeEventListener('offline', down)
      window.removeEventListener('online', up)
    }
  }, [])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    // Starting up, the saved copy shows first and the server answers a moment later: only a
    // gap longer than `graceMs` counts.
    const stop = watchServerReach(familyId, (reached) => {
      clearTimeout(timer)
      if (reached) setCut(false)
      else timer = setTimeout(() => setCut(true), graceMs)
    })
    return () => {
      clearTimeout(timer)
      stop()
    }
  }, [familyId, graceMs])
  return netDown || cut
}
