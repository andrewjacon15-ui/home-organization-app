import { useCallback, useEffect, useState } from 'react'

export const APP_VERSION = __APP_VERSION__
export const BUILD_TIME = __BUILD_TIME__

const POLL_MS = 30 * 60 * 1000

export interface LiveVersion {
  version: string
  buildTime: string
}

/** The version currently deployed (bypasses every cache). null when offline or in dev. */
export async function fetchLiveVersion(fetchImpl: typeof fetch = fetch): Promise<LiveVersion | null> {
  try {
    const res = await fetchImpl(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as LiveVersion
  } catch {
    return null
  }
}

/** Pulls the newest release: refresh the service worker, then reload the page. */
export async function reloadToLatest() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
  } catch {
    // No service worker (dev, private mode): a plain reload still fetches the newest files.
  }
  window.location.reload()
}

export type UpdateState = 'idle' | 'checking' | 'current' | 'available' | 'offline'

/** Polls every 30 minutes (and on demand) for a newer deployed version. `onMount` also checks right away. */
export function useUpdateCheck({ onMount = false } = {}) {
  const [state, setState] = useState<UpdateState>('idle')
  const [live, setLive] = useState<LiveVersion | null>(null)

  const apply = useCallback((v: LiveVersion | null) => {
    setLive(v)
    setState(!v ? 'offline' : v.version !== APP_VERSION ? 'available' : 'current')
  }, [])

  const check = useCallback(async () => {
    setState('checking')
    apply(await fetchLiveVersion())
  }, [apply])

  // Background checks update quietly; only the button shows "Checking…".
  useEffect(() => {
    if (import.meta.env.DEV) return
    const refresh = () => void fetchLiveVersion().then(apply)
    if (onMount) refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [apply, onMount])

  return { state, live, check }
}
