import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { isKioskBrowser } from '../../kiosk'
import { useSettings } from '../settings/SettingsContext'
import { useSleep } from '../sleep/SleepContext'
import { watchPhotos, type Photo } from './photosApi'
import { Slideshow } from './Slideshow'

interface ScreensaverValue {
  photos: Photo[]
  /** The idle screensaver runs here (the wall tablet). */
  applies: boolean
  startNow: () => void
}

const ScreensaverContext = createContext<ScreensaverValue>({ photos: [], applies: false, startNow: () => undefined })

const CHECK_MS = 5_000

/** Shows the family photo slideshow on the wall tablet after it sits idle (never while asleep). */
export function ScreensaverProvider({ familyId, children, kiosk = isKioskBrowser() }: { familyId: string; children: ReactNode; kiosk?: boolean }) {
  const { settings } = useSettings()
  const { asleep } = useSleep()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [active, setActive] = useState(false)
  const lastActivity = useRef(0)

  useEffect(() => watchPhotos(familyId, setPhotos), [familyId])

  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now()
    }
    touch()
    const events = ['pointerdown', 'keydown', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const id = setInterval(() => {
      const idle = Date.now() - lastActivity.current >= settings.screensaverAfterMinutes * 60_000
      if (kiosk && settings.screensaverEnabled && photos.length > 0 && !asleep && idle) setActive(true)
    }, CHECK_MS)
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      clearInterval(id)
    }
  }, [kiosk, settings.screensaverEnabled, settings.screensaverAfterMinutes, photos.length, asleep])

  const startNow = useCallback(() => setActive(true), [])
  const showing = active && photos.length > 0 && !asleep

  return (
    <ScreensaverContext.Provider value={{ photos, applies: kiosk, startNow }}>
      {children}
      {showing && (
        <Slideshow
          photos={photos}
          seconds={settings.screensaverSeconds}
          shuffle={settings.screensaverShuffle}
          onExit={() => {
            lastActivity.current = Date.now()
            setActive(false)
          }}
        />
      )}
    </ScreensaverContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useScreensaver() {
  return useContext(ScreensaverContext)
}
