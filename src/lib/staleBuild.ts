/** The newest release replaced the files this copy of the app still asks for (it was open during a deploy). */
export function isStaleBuildError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Unable to preload CSS|is not a valid JavaScript MIME type/i.test(text)
}

const RELOAD_KEY = 'stale-build-reload'
const RELOAD_GAP_MS = 5 * 60_000

function session(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Reloads once to pick up the new release. Never twice within five minutes, so a page that's
 * really broken (or a site that's down) can't reload over and over.
 */
export function reloadForNewBuild(now = Date.now(), storage = session(), reload = () => window.location.reload()): boolean {
  const last = Number(storage?.getItem(RELOAD_KEY) ?? 0)
  if (now - last < RELOAD_GAP_MS) return false
  storage?.setItem(RELOAD_KEY, String(now))
  reload()
  return true
}
