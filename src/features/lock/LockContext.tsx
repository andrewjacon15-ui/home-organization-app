import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_LOCK, shouldLock, verifyPin, watchLock, type LockConfig } from './lockApi'

interface LockValue {
  config: LockConfig
  locked: boolean
  /** Resolves true when the PIN was right. */
  unlock: (pin: string) => Promise<boolean>
  lockNow: () => void
  /** The person who just set the PIN stays unlocked until the device goes idle. */
  markUnlocked: () => void
}

const LockContext = createContext<LockValue>({ config: DEFAULT_LOCK, locked: false, unlock: async () => true, lockNow: () => undefined, markUnlocked: () => undefined })

const CHECK_MS = 10_000

/** Tracks inactivity on this device and locks Settings when the family's parental lock is on. */
export function LockProvider({ familyId, children }: { familyId: string; children: ReactNode }) {
  const [config, setConfig] = useState(DEFAULT_LOCK)
  const [unlockedAt, setUnlockedAt] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)
  const lastActivity = useRef(0)

  useEffect(() => watchLock(familyId, setConfig), [familyId])

  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now()
    }
    touch()
    const events = ['pointerdown', 'keydown', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const evaluate = () => setLocked(shouldLock(config, unlockedAt, lastActivity.current, Date.now()))
    evaluate()
    const id = setInterval(evaluate, CHECK_MS)
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      clearInterval(id)
    }
  }, [config, unlockedAt])

  const unlock = useCallback(
    async (pin: string) => {
      const ok = await verifyPin(pin, config)
      if (ok) {
        lastActivity.current = Date.now()
        setUnlockedAt(Date.now())
        setLocked(false)
      }
      return ok
    },
    [config],
  )

  const markUnlocked = useCallback(() => {
    lastActivity.current = Date.now()
    setUnlockedAt(Date.now())
    setLocked(false)
  }, [])

  const lockNow = useCallback(() => {
    setUnlockedAt(null)
    setLocked(true)
  }, [])

  return <LockContext.Provider value={{ config, locked, unlock, lockNow, markUnlocked }}>{children}</LockContext.Provider>
}

/** Test helper. */
export function StaticLock({ value, children }: { value: Partial<LockValue>; children: ReactNode }) {
  return (
    <LockContext.Provider value={{ config: DEFAULT_LOCK, locked: false, unlock: async () => true, lockNow: () => undefined, markUnlocked: () => undefined, ...value }}>
      {children}
    </LockContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLock() {
  return useContext(LockContext)
}
