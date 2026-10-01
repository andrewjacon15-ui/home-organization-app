import { useEffect, useSyncExternalStore } from 'react'

/**
 * "Keep the screen on": while anything holds it (cooking mode), our sleep mode and photo
 * screensaver stay off, and the browser's Wake Lock keeps the display from dimming.
 */
let holds = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function holdAwake(): () => void {
  holds++
  emit()
  let released = false
  return () => {
    if (released) return
    released = true
    holds--
    emit()
  }
}

export const isHeldAwake = () => holds > 0

export function useHeldAwake(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    isHeldAwake,
    isHeldAwake,
  )
}

interface WakeLockSentinel {
  release(): Promise<void>
}

/** Holds the screen awake while `active` (and re-acquires the Wake Lock when the page returns). */
export function useKeepAwake(active: boolean) {
  useEffect(() => {
    if (!active) return
    const release = holdAwake()
    const nav = navigator as unknown as { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> } }
    let lock: WakeLockSentinel | null = null
    let stopped = false
    const acquire = () => {
      if (!nav.wakeLock || document.visibilityState !== 'visible') return
      nav.wakeLock.request('screen').then(
        (l) => (stopped ? void l.release() : (lock = l)),
        () => undefined, // not allowed (battery saver, old browser): our own sleep is still paused
      )
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', acquire)
      lock?.release().catch(() => undefined)
      release()
    }
  }, [active])
}
