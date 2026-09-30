import { isKioskBrowser } from '../kiosk'

/**
 * What kind of device the app is running on. It picks the layout (phone: bottom bar
 * and lists; tablet: wall display that fits the screen, big touch targets, sleep mode
 * and the screensaver; desktop: mouse and keyboard), the default calendar view, and
 * which side-bar sections show.
 */
export type Device = 'phone' | 'tablet' | 'desktop'
export type DevicePref = 'auto' | Device

export const DEVICE_LABELS: Record<Device, string> = { phone: 'Phone', tablet: 'Tablet', desktop: 'Computer' }

export interface DeviceEnv {
  kiosk: boolean
  /** Touch is the primary input. */
  coarse: boolean
  /** The screen's shorter side, in CSS pixels. */
  shortSide: number
}

/** Kiosk = the wall tablet; otherwise a touch screen is a phone or tablet by size, and a mouse means a computer. */
export function detectDevice({ kiosk, coarse, shortSide }: DeviceEnv): Device {
  if (kiosk) return 'tablet'
  if (coarse) return shortSide < 600 ? 'phone' : 'tablet'
  return 'desktop'
}

/** A computer window squeezed narrow gets the phone layout; so does a tiny tablet window. */
export function layoutFor(device: Device, width: number): Device {
  return device !== 'phone' && width < 720 ? 'phone' : device
}

export function readEnv(): DeviceEnv {
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  const shortSide = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight)
  return { kiosk: isKioskBrowser(), coarse, shortSide }
}

const PREF_KEY = 'device-pref'

/** Each device remembers its own override. */
export function readDevicePref(): DevicePref {
  try {
    const v = localStorage.getItem(PREF_KEY)
    return v === 'phone' || v === 'tablet' || v === 'desktop' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function saveDevicePref(pref: DevicePref) {
  try {
    if (pref === 'auto') localStorage.removeItem(PREF_KEY)
    else localStorage.setItem(PREF_KEY, pref)
  } catch {
    // An override is a convenience; auto-detect still works.
  }
}
