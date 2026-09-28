import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'

/** families/{id}/settings/lock. The PIN itself is never stored, only a salted hash. */
export interface LockConfig {
  enabled: boolean
  pinHash?: string
  salt?: string
  lockAfterMinutes: number
}

export const DEFAULT_LOCK: LockConfig = { enabled: false, lockAfterMinutes: 5 }

const lockRef = (familyId: string) => doc(db, 'families', familyId, 'settings', 'lock')

export function watchLock(familyId: string, onChange: (config: LockConfig) => void) {
  return onSnapshot(lockRef(familyId), (snap) => onChange({ ...DEFAULT_LOCK, ...(snap.exists() ? (snap.data() as Partial<LockConfig>) : {}) }))
}

export function saveLock(familyId: string, config: LockConfig) {
  return setDoc(lockRef(familyId), config)
}

const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

export function newSalt(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)))
}

/** SHA-256 of salt + PIN, as 64 hex characters. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)))
}

export async function verifyPin(pin: string, config: LockConfig): Promise<boolean> {
  if (!config.pinHash || !config.salt) return false
  return (await hashPin(pin, config.salt)) === config.pinHash
}

export const isValidPin = (pin: string) => /^\d{4}$/.test(pin)

/** Locked when the lock is on and the device has been idle longer than the limit (or was never unlocked). */
export function shouldLock(config: LockConfig, unlockedAt: number | null, lastActivity: number, now: number): boolean {
  if (!config.enabled || !config.pinHash) return false
  if (unlockedAt === null) return true
  return now - lastActivity >= config.lockAfterMinutes * 60_000
}
