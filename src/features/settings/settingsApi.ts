import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { DEFAULT_ACCENT } from '../../lib/colors'

/** Family-wide display settings (families/{id}/settings/display). Every field is optional in Firestore. */
export interface DisplaySettings {
  calendarName: string
  /** 0 = Sunday … 6 = Saturday */
  weekStartsOn: number
  showCountdowns: 'always' | 'never'
  colorCodeMultiProfile: boolean
  shadeWeekends: boolean
  dimPastEvents: boolean
  weekStartToday: boolean
  monthStartCurrentWeek: boolean
  scheduleDays: number
  scheduleStartToday: boolean
  temperatureUnit: 'F' | 'C'
  weatherLocation: { label: string; lat: number; lon: number } | null
  textSize: 'small' | 'medium' | 'large'
  density: 'compact' | 'cozy' | 'comfortable'
  remindAtStart: boolean
  remindBeforeEnabled: boolean
  remindBeforeMinutes: number
  remindChoresDue: boolean
  reminderSound: boolean
  showPhotosTab: boolean
  theme: 'system' | 'light' | 'dark'
  accentColor: string
}

/** Mirrors the Skylight defaults from the user's tablet. */
export const DEFAULT_SETTINGS: DisplaySettings = {
  calendarName: '',
  weekStartsOn: 0,
  showCountdowns: 'always',
  colorCodeMultiProfile: true,
  shadeWeekends: false,
  dimPastEvents: true,
  weekStartToday: false,
  monthStartCurrentWeek: true,
  scheduleDays: 7,
  scheduleStartToday: false,
  temperatureUnit: 'F',
  weatherLocation: null,
  textSize: 'medium',
  density: 'cozy',
  remindAtStart: false,
  remindBeforeEnabled: true,
  remindBeforeMinutes: 30,
  remindChoresDue: false,
  reminderSound: true,
  showPhotosTab: true,
  theme: 'system',
  accentColor: DEFAULT_ACCENT,
}

const displayRef = (familyId: string) => doc(db, 'families', familyId, 'settings', 'display')

export function watchDisplaySettings(familyId: string, onChange: (settings: DisplaySettings) => void) {
  return onSnapshot(displayRef(familyId), (snap) => {
    onChange({ ...DEFAULT_SETTINGS, ...(snap.exists() ? (snap.data() as Partial<DisplaySettings>) : {}) })
  })
}

export function updateDisplaySettings(familyId: string, changes: Partial<DisplaySettings>) {
  return setDoc(displayRef(familyId), changes, { merge: true })
}
