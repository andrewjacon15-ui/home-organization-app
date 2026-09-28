import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS, updateDisplaySettings, watchDisplaySettings, type DisplaySettings } from './settingsApi'

interface SettingsValue {
  settings: DisplaySettings
  update: (changes: Partial<DisplaySettings>) => Promise<void>
}

const SettingsContext = createContext<SettingsValue>({ settings: DEFAULT_SETTINGS, update: async () => undefined })

export function SettingsProvider({ familyId, children }: { familyId: string; children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  useEffect(() => watchDisplaySettings(familyId, setSettings), [familyId])
  const update = useCallback((changes: Partial<DisplaySettings>) => updateDisplaySettings(familyId, changes), [familyId])
  return <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>
}

/** Test helper: provide fixed settings without Firestore. */
export function StaticSettings({ settings, update, children }: { settings?: Partial<DisplaySettings>; update?: SettingsValue['update']; children: ReactNode }) {
  return (
    <SettingsContext.Provider value={{ settings: { ...DEFAULT_SETTINGS, ...settings }, update: update ?? (async () => undefined) }}>
      {children}
    </SettingsContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  return useContext(SettingsContext)
}
