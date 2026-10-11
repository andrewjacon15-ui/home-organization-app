/** The subset of a Google Calendar API event we read. */
export interface GoogleEvent {
  id?: string | null
  status?: string | null
  summary?: string | null
  location?: string | null
  htmlLink?: string | null
  /** 'default' | 'outOfOffice' | 'focusTime' | 'workingLocation' | 'birthday' | … */
  eventType?: string | null
  /** Birthday events only: 'birthday' | 'anniversary' | 'self' | 'custom' | 'other'. */
  birthdayProperties?: { type?: string | null } | null
  start?: { date?: string | null; dateTime?: string | null } | null
  end?: { date?: string | null; dateTime?: string | null } | null
}

/** What we store in families/{familyId}/events/{eventId}. Dates stay as JS Dates until the store layer. */
export interface EventDoc {
  /** google = a person's Google calendar; ics = a calendar link (feeds.ts). */
  source: 'google' | 'ics'
  sourceUserId: string
  googleEventId: string
  /** Which synced calendar it came from (families/{id}/calendars/{calendarKey}). */
  calendarKey: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  /** All-day events only: YYYY-MM-DD, end exclusive (Google's convention). */
  startDate?: string
  endDate?: string
  location?: string
  htmlLink?: string
  /** A birthday or anniversary (from Google Contacts), which Home's countdowns pick up. */
  special?: 'birthday' | 'anniversary'
}

export type CalendarStatus =
  | { status: 'connected'; email: string; lastSyncAt: Date; eventCount: number; calendarCount: number }
  | { status: 'needs_reconnect'; email: string; error: string }

export interface StoredTokens {
  refreshToken: string
  email: string
  scope: string
  /** Fingerprint of the events the last sync wrote; when Google returns the same, the sync skips re-reading them. */
  syncDigest?: string
}

export interface ConnectedMember {
  familyId: string
  uid: string
  tokens: StoredTokens
}

/** One entry of a person's Google calendar list. */
export interface GoogleCalendarEntry {
  id: string
  summary: string
  backgroundColor?: string | null
  primary?: boolean | null
  /** Checked in the Google Calendar UI. */
  selected?: boolean | null
  accessRole?: string | null
}

/** families/{familyId}/calendars/{key}. name/googleColor/primary follow Google; the rest is the family's choice. */
export interface StoredCalendar {
  key: string
  ownerId: string
  calendarId: string
  name: string
  googleColor: string
  primary: boolean
  enabled: boolean
  color: string
  memberIds: string[]
  alias?: string
  /** Set on calendar links (feeds.ts); Google calendars leave it out. */
  kind?: 'ics'
}

/** Everything the calendar code needs from Firestore. Real impl: store.ts. Tests: an in-memory fake. */
export interface CalendarStore {
  isMember(familyId: string, uid: string): Promise<boolean>
  getTokens(familyId: string, uid: string): Promise<StoredTokens | null>
  saveTokens(familyId: string, uid: string, tokens: StoredTokens): Promise<void>
  deleteTokens(familyId: string, uid: string): Promise<void>
  listConnected(): Promise<ConnectedMember[]>
  listGoogleEventIds(familyId: string, uid: string): Promise<string[]>
  /** This person's synced events as stored, so a sync can write only what changed. */
  listGoogleEvents(familyId: string, uid: string): Promise<Map<string, EventDoc>>
  getCalendarStatus(familyId: string, uid: string): Promise<CalendarStatus | null>
  upsertEvents(familyId: string, events: { id: string; data: EventDoc }[]): Promise<void>
  deleteEvents(familyId: string, ids: string[]): Promise<void>
  setCalendarStatus(familyId: string, uid: string, status: CalendarStatus | null): Promise<void>
  listCalendars(familyId: string, uid: string): Promise<StoredCalendar[]>
  upsertCalendars(familyId: string, calendars: StoredCalendar[]): Promise<void>
  deleteCalendars(familyId: string, keys: string[]): Promise<void>
  saveSyncDigest(familyId: string, uid: string, digest: string): Promise<void>
}

/** Everything the calendar code needs from Google. Real impl: google.ts. Tests: a stub. */
export interface GoogleApi {
  /** Exchanges a GIS popup auth code. refreshToken is absent if Google didn't issue a new one. */
  exchangeCode(code: string): Promise<{ refreshToken?: string; email: string; scope: string }>
  listCalendars(refreshToken: string): Promise<GoogleCalendarEntry[]>
  listEvents(refreshToken: string, calendarId: string, timeMin: Date, timeMax: Date): Promise<GoogleEvent[]>
  revoke(refreshToken: string): Promise<void>
}
