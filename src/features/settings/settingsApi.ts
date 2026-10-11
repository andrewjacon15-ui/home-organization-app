import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { DEFAULT_ACCENT } from '../../lib/colors'
import type { Device } from '../../lib/device'

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
  /** What the Weather tab shows besides the temperature and sky (see WEATHER_DETAILS). */
  weatherDetails: string[]
  /** National Weather Service alerts (United States). */
  weatherAlerts: boolean
  /** What the Weather tab opens to on each kind of device. */
  weatherView: Partial<Record<Device, 'day' | 'threeDay' | 'week'>>
  /** A small icon and high in calendar day headers. */
  weatherOnCalendar: boolean
  textSize: 'small' | 'medium' | 'large'
  density: 'compact' | 'cozy' | 'comfortable'
  remindAtStart: boolean
  remindBeforeEnabled: boolean
  remindBeforeMinutes: number
  remindChoresDue: boolean
  reminderSound: boolean
  theme: 'system' | 'light' | 'dark'
  accentColor: string
  /** Color synced events by their Google calendar's color, or by the person's color. */
  colorEventsBy: 'person' | 'calendar'
  /** Wall display only. */
  sleepEnabled: boolean
  sleepFrom: string
  sleepTo: string
  /** Wall display only: photo slideshow after this many idle minutes. */
  screensaverEnabled: boolean
  screensaverAfterMinutes: number
  screensaverSeconds: number
  screensaverShuffle: boolean
  /** Side-bar sections hidden on each kind of device. */
  hiddenTabs: Partial<Record<Device, string[]>>
  /** Home screen panels shown on each kind of device, top to bottom (unset = Lists, Tasks, Calendar). */
  homePanels: Partial<Record<Device, string[]>>
  /** Which homePanels migration the saved lists have had (see HOME_PANELS_VERSION; unset = none). */
  homePanelsVersion: number
  /** Days the Home calendar shows: 1, 3, or 7. */
  homeCalendarDays: number
  /** US holidays in the next two months show among the Home countdowns. */
  countdownHolidays: boolean
  /** Birthdays and anniversaries from everyone's Google Calendar show among the countdowns. */
  countdownGoogle: boolean
  /** Checked-off list items delete themselves after this many days (0 = keep until cleared). */
  listDoneDays: number
  /** Text size for one kind of device, instead of textSize (unset = textSize). */
  textSizeBy: Partial<Record<Device, 'small' | 'medium' | 'large'>>
  /** The tab each kind of device opens to (unset = the last one used there). */
  startTab: Partial<Record<Device, string>>
  /** Home shows the daily summary, or the panels (Settings → Home screen), per kind of device. */
  homeStyle: Partial<Record<Device, 'summary' | 'panels'>>
  /** Quiet hours: no reminder sounds, pop-ups or reminder emails (kitchen timers still ring). */
  quietEnabled: boolean
  quietFrom: string
  quietTo: string
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
  weatherDetails: ['precip', 'hourly', 'feels', 'wind', 'uv', 'sun'],
  weatherAlerts: true,
  weatherView: {},
  weatherOnCalendar: true,
  textSize: 'medium',
  density: 'cozy',
  remindAtStart: false,
  remindBeforeEnabled: true,
  remindBeforeMinutes: 30,
  remindChoresDue: false,
  reminderSound: true,
  theme: 'light',
  accentColor: DEFAULT_ACCENT,
  colorEventsBy: 'calendar',
  sleepEnabled: true,
  sleepFrom: '21:00',
  sleepTo: '06:00',
  screensaverEnabled: true,
  screensaverAfterMinutes: 5,
  screensaverSeconds: 12,
  screensaverShuffle: true,
  hiddenTabs: {},
  homePanels: {},
  homePanelsVersion: 0,
  homeCalendarDays: 3,
  countdownHolidays: true,
  countdownGoogle: true,
  listDoneDays: 30,
  textSizeBy: {},
  startTab: {},
  homeStyle: {},
  quietEnabled: false,
  quietFrom: '21:00',
  quietTo: '07:00',
}

/** The text size on this kind of device. */
export const textSizeFor = (s: Pick<DisplaySettings, 'textSize' | 'textSizeBy'>, device: Device) => s.textSizeBy?.[device] ?? s.textSize

/** What Home shows on this kind of device (the daily summary unless switched to panels). */
export const homeStyleFor = (s: Pick<DisplaySettings, 'homeStyle'>, device: Device) => s.homeStyle?.[device] ?? 'summary'

const displayRef = (familyId: string) => doc(db, 'families', familyId, 'settings', 'display')

export function watchDisplaySettings(familyId: string, onChange: (settings: DisplaySettings) => void) {
  return onSnapshot(displayRef(familyId), (snap) => {
    onChange({ ...DEFAULT_SETTINGS, ...(snap.exists() ? (snap.data() as Partial<DisplaySettings>) : {}) })
  })
}

export function updateDisplaySettings(familyId: string, changes: Partial<DisplaySettings>) {
  return setDoc(displayRef(familyId), changes, { merge: true })
}
