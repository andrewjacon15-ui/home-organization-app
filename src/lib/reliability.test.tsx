import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary, RETRY_MS } from '../components/ErrorBoundary'
import { untilNextTick, useNow, useOffline } from './hooks'
import { isStaleBuildError } from './staleBuild'

// The boundary's reload is counted instead (jsdom can't reload); the real one is tested below.
const reloads = vi.hoisted(() => ({ count: 0 }))
vi.mock('./staleBuild', async (importActual) => ({
  ...(await importActual<typeof import('./staleBuild')>()),
  reloadForNewBuild: () => {
    reloads.count++
    return true
  },
}))

let reach: ((reached: boolean) => void) | null = null
vi.mock('./family', async (importActual) => ({
  ...(await importActual<typeof import('./family')>()),
  watchServerReach: (_familyId: string, onChange: (reached: boolean) => void) => {
    reach = onChange
    return () => {
      reach = null
    }
  },
}))

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('a new release while the app is open', () => {
  it('recognizes a page whose files were replaced, in each browser’s words', () => {
    expect(isStaleBuildError(new TypeError('Failed to fetch dynamically imported module: https://x.web.app/assets/CalendarPage-1a2b.js'))).toBe(true)
    expect(isStaleBuildError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isStaleBuildError(new TypeError('error loading dynamically imported module'))).toBe(true)
    expect(isStaleBuildError(new Error('Unable to preload CSS for /assets/HomeView-9f.css'))).toBe(true)
    expect(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'title')"))).toBe(false)
  })

  it('reloads once, and not again for five minutes, so it can never loop', async () => {
    const { reloadForNewBuild: real } = await vi.importActual<typeof import('./staleBuild')>('./staleBuild')
    const saved = new Map<string, string>()
    const storage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) } as Storage
    const reload = vi.fn()
    expect(real(1_000_000, storage, reload)).toBe(true)
    expect(real(1_000_000 + 60_000, storage, reload)).toBe(false)
    expect(real(1_000_000 + 5 * 60_000 + 1, storage, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})

describe('ErrorBoundary', () => {
  let broken = true
  function Page() {
    if (broken) throw new TypeError("Cannot read properties of undefined (reading 'title')")
    return <p>Rewards</p>
  }
  beforeEach(() => {
    broken = true
    reloads.count = 0
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('keeps a broken page from taking the rest of the app with it, and tries again when asked', () => {
    render(
      <>
        <nav>Side bar</nav>
        <ErrorBoundary>
          <Page />
        </ErrorBoundary>
      </>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong here.')
    expect(screen.getByRole('alert')).toHaveTextContent("reading 'title'")
    expect(screen.getByText('Side bar')).toBeInTheDocument()
    broken = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('Rewards')).toBeInTheDocument()
  })

  it('tries again by itself a minute later (the wall display has nobody to tap)', () => {
    vi.useFakeTimers()
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    broken = false
    act(() => void vi.advanceTimersByTime(RETRY_MS))
    expect(screen.getByText('Rewards')).toBeInTheDocument()
  })

  it('reloads into the new release when a page’s files are gone', () => {
    function Stale(): never {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/RewardsPage-old.js')
    }
    render(
      <ErrorBoundary>
        <Stale />
      </ErrorBoundary>,
    )
    expect(reloads.count).toBe(1)
  })
})

describe('the clock', () => {
  it('ticks on the clock’s own half-minutes, not 30 s after the page opened', () => {
    expect(untilNextTick(30_000, Date.UTC(2026, 9, 10, 22, 31, 12))).toBe(18_020)
    expect(untilNextTick(60_000, Date.UTC(2026, 9, 10, 22, 31, 59, 990))).toBe(30)
  })

  it('turns over to the next minute on the minute', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 10, 22, 31, 12))
    const { result } = renderHook(() => useNow())
    act(() => void vi.advanceTimersByTime(17_000))
    expect(result.current.getMinutes()).toBe(31)
    act(() => void vi.advanceTimersByTime(29_000))
    expect(result.current.getSeconds()).toBe(30)
    act(() => void vi.advanceTimersByTime(30_000))
    expect(result.current.getMinutes()).toBe(32)
    expect(result.current.getSeconds()).toBe(0)
  })
})

describe('useOffline', () => {
  it('says offline only after a real gap, not while the saved copy shows first on startup', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useOffline('fam'))
    act(() => reach!(false))
    act(() => void vi.advanceTimersByTime(5_000))
    act(() => reach!(true))
    act(() => void vi.advanceTimersByTime(20_000))
    expect(result.current).toBe(false)
    act(() => reach!(false))
    act(() => void vi.advanceTimersByTime(15_000))
    expect(result.current).toBe(true)
    act(() => reach!(true))
    expect(result.current).toBe(false)
  })

  it('says offline at once when the device loses its connection', () => {
    const { result } = renderHook(() => useOffline('fam'))
    act(() => void window.dispatchEvent(new Event('offline')))
    expect(result.current).toBe(true)
    act(() => void window.dispatchEvent(new Event('online')))
    expect(result.current).toBe(false)
  })
})
