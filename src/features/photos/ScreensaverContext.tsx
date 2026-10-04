import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useDevice } from '../../lib/DeviceContext'
import { isHeldAwake } from '../../lib/keepAwake'
import { useSettings } from '../settings/SettingsContext'
import { useSleep } from '../sleep/SleepContext'
import { watchPhotos, type Photo } from './photosApi'
import { Slideshow } from './Slideshow'

interface ScreensaverValue {
  photos: Photo[]
  /** The idle screensaver runs here (the wall tablet). */
  applies: boolean
  startNow: () => void
  /** A screen that shows photos asks for the library while it's open; returns the "done". */
  want: () => () => void
}

const ScreensaverContext = createContext<ScreensaverValue>({ photos: [], applies: false, startNow: () => undefined, want: () => () => undefined })

const CHECK_MS = 5_000

/** Shows the family photo slideshow on the wall tablet after it sits idle (never while asleep). */
export function ScreensaverProvider({ familyId, children, kiosk: kioskProp }: { familyId: string; children: ReactNode; kiosk?: boolean }) {
  const { device } = useDevice()
  const kiosk = kioskProp ?? device === 'tablet'
  const { settings } = useSettings()
  const { asleep } = useSleep()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [active, setActive] = useState(false)
  const lastActivity = useRef(0)
  const [wanted, setWanted] = useState(0)
  const want = useCallback(() => {
    setWanted((n) => n + 1)
    return () => setWanted((n) => n - 1)
  }, [])

  // The photo library is read only where it's used: the tablet's screensaver, or a screen
  // showing photos (Photos, Settings → Photos). Phones don't read it in the background.
  const listen = (kiosk && settings.screensaverEnabled) || wanted > 0
  useEffect(() => (listen ? watchPhotos(familyId, setPhotos) : undefined), [familyId, listen])

  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now()
    }
    touch()
    const events = ['pointerdown', 'keydown', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const id = setInterval(() => {
      const idle = Date.now() - lastActivity.current >= settings.screensaverAfterMinutes * 60_000
      if (kiosk && settings.screensaverEnabled && photos.length > 0 && !asleep && idle && !isHeldAwake()) setActive(true)
    }, CHECK_MS)
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      clearInterval(id)
    }
  }, [kiosk, settings.screensaverEnabled, settings.screensaverAfterMinutes, photos.length, asleep])

  const startNow = useCallback(() => setActive(true), [])
  const showing = active && photos.length > 0 && !asleep

  return (
    <ScreensaverContext.Provider value={{ photos, applies: kiosk, startNow, want }}>
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
  const value = useContext(ScreensaverContext)
  const { want } = value
  useEffect(() => want(), [want])
  return value
}
