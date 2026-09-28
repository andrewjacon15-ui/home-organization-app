import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { detectTimezone } from '../../lib/dates'

/** families/{id}/reminderPrefs/{uid}: private to each person; read by the reminder-email job. */
export interface ReminderPrefs {
  eventEmailsEnabled: boolean
  leadTimeMinutes: number
  dailyDigestEnabled: boolean
  digestHourLocal: number
  timezone: string
}

export const defaultPrefs = (timezone = detectTimezone()): ReminderPrefs => ({
  eventEmailsEnabled: false,
  leadTimeMinutes: 30,
  dailyDigestEnabled: false,
  digestHourLocal: 7,
  timezone,
})

const prefsRef = (familyId: string, userId: string) => doc(db, 'families', familyId, 'reminderPrefs', userId)

export function watchReminderPrefs(familyId: string, userId: string, fallback: ReminderPrefs, onChange: (p: ReminderPrefs) => void) {
  return onSnapshot(prefsRef(familyId, userId), (snap) => onChange({ ...fallback, ...(snap.exists() ? (snap.data() as Partial<ReminderPrefs>) : {}) }))
}

/** Always writes the whole doc: the rules require every field. */
export function saveReminderPrefs(familyId: string, userId: string, prefs: ReminderPrefs) {
  return setDoc(prefsRef(familyId, userId), prefs)
}
