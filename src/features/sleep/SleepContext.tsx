import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { isKioskBrowser } from '../../kiosk'
import { useSettings } from '../settings/SettingsContext'
import { inSleepWindow, isAsleep } from './sleep'

interface FullyApi {
  turnScreenOff?: (keepAlive?: boolean) => void
  turnScreenOn?: () => void
}

interface SleepValue {
  asleep: boolean
  /** Sleep schedule applies here (the wall tablet), not on phones. */
  applies: boolean
  sleepNow: () => void
}

const SleepContext = createContext<SleepValue>({ asleep: false, applies: false, sleepNow: () => undefined })

const CHECK_MS = 15_000

/**
 * Blanks the wall tablet during the sleep window (and on "Enter Sleep Mode Now").
 * A tap wakes it; inside the window it dozes off again after 2 idle minutes.
 * With Fully Kiosk's JavaScript interface enabled, the backlight is turned off too.
 */
export function SleepProvider({ children, kiosk = isKioskBrowser() }: { children: ReactNode; kiosk?: boolean }) {
  const { settings } = useSettings()
  const [asleep, setAsleep] = useState(false)
  const manual = useRef(false)
  const lastActivity = useRef(0)

  const evaluate = useCallback(() => {
    const now = new Date()
    const scheduled = kiosk && settings.sleepEnabled && inSleepWindow(now, settings.sleepFrom, settings.sleepTo)
    setAsleep(isAsleep({ scheduled, manual: manual.current, lastActivity: lastActivity.current }, now.getTime()))
  }, [kiosk, settings.sleepEnabled, settings.sleepFrom, settings.sleepTo])

  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now()
      if (manual.current) manual.current = false
      evaluate()
    }
    lastActivity.current = Date.now()
    const events = ['pointerdown', 'keydown'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const id = setInterval(evaluate, CHECK_MS)
    evaluate()
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      clearInterval(id)
    }
  }, [evaluate])

  // Real screen off where Fully allows it.
  useEffect(() => {
    const fully = (window as unknown as { fully?: FullyApi }).fully
    if (!fully) return
    if (asleep) fully.turnScreenOff?.(true)
    else fully.turnScreenOn?.()
  }, [asleep])

  const sleepNow = useCallback(() => {
    // Let the tap that pressed the button finish first, so it doesn't count as a wake-up.
    setTimeout(() => {
      manual.current = true
      evaluate()
    }, 300)
  }, [evaluate])

  return (
    <SleepContext.Provider value={{ asleep, applies: kiosk, sleepNow }}>
      {children}
      {asleep && (
        <div className="sleep" role="button" tabIndex={0} aria-label="Sleeping. Tap to wake.">
          <span className="sleep__hint">Tap to wake</span>
        </div>
      )}
    </SleepContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSleep() {
  return useContext(SleepContext)
}
