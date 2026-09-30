import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { detectDevice, layoutFor, readDevicePref, readEnv, saveDevicePref, type Device, type DevicePref } from './device'

interface DeviceValue {
  /** What this device is (after any override). */
  device: Device
  /** What auto-detect says. */
  detected: Device
  pref: DevicePref
  setPref: (pref: DevicePref) => void
  /** The layout in use right now: `device`, except that narrow windows get the phone layout. */
  layout: Device
}

const DeviceContext = createContext<DeviceValue>({ device: 'desktop', detected: 'desktop', pref: 'auto', setPref: () => undefined, layout: 'desktop' })

function measure(pref: DevicePref) {
  const detected = detectDevice(readEnv())
  const device = pref === 'auto' ? detected : pref
  return { detected, device, layout: layoutFor(device, window.innerWidth) }
}

/** Works out the device once, re-checks on resize/rotation, and tags <html data-device> for the CSS. */
export function DeviceProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<DevicePref>(readDevicePref)
  const [state, setState] = useState(() => measure(pref))

  useEffect(() => {
    const update = () => setState(measure(pref))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [pref])

  // Before paint, so a phone never flashes the wall layout.
  useLayoutEffect(() => {
    document.documentElement.dataset.device = state.layout
  }, [state.layout])

  const setPref = (p: DevicePref) => {
    saveDevicePref(p)
    setPrefState(p)
  }

  return <DeviceContext.Provider value={{ ...state, pref, setPref }}>{children}</DeviceContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDevice() {
  return useContext(DeviceContext)
}

/** For tests: a fixed device. */
export function StaticDevice({ device, children }: { device: Device; children: ReactNode }) {
  return <DeviceContext.Provider value={{ device, detected: device, pref: 'auto', setPref: () => undefined, layout: device }}>{children}</DeviceContext.Provider>
}
