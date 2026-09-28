/** The subset of a Google Calendar API event we read. */
export interface GoogleEvent {
  id?: string | null
  status?: string | null
  summary?: string | null
  location?: string | null
  htmlLink?: string | null
  start?: { date?: string | null; dateTime?: string | null } | null
  end?: { date?: string | null; dateTime?: string | null } | null
}

/** What we store in families/{familyId}/events/{eventId}. Dates stay as JS Dates until the store layer. */
export interface EventDoc {
  source: 'google'
  sourceUserId: string
  googleEventId: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  /** All-day events only: YYYY-MM-DD, end exclusive (Google's convention). */
  startDate?: string
  endDate?: string
  location?: string
  htmlLink?: string
}

export type CalendarStatus =
  | { status: 'connected'; email: string; lastSyncAt: Date; eventCount: number }
  | { status: 'needs_reconnect'; email: string; error: string }

export interface StoredTokens {
  refreshToken: string
  email: string
  scope: string
}

export interface ConnectedMember {
  familyId: string
  uid: string
  tokens: StoredTokens
}

/** Everything the calendar code needs from Firestore. Real impl: store.ts. Tests: an in-memory fake. */
export interface CalendarStore {
  isMember(familyId: string, uid: string): Promise<boolean>
  getTokens(familyId: string, uid: string): Promise<StoredTokens | null>
  saveTokens(familyId: string, uid: string, tokens: StoredTokens): Promise<void>
  deleteTokens(familyId: string, uid: string): Promise<void>
  listConnected(): Promise<ConnectedMember[]>
  listGoogleEventIds(familyId: string, uid: string): Promise<string[]>
  upsertEvents(familyId: string, events: { id: string; data: EventDoc }[]): Promise<void>
  deleteEvents(familyId: string, ids: string[]): Promise<void>
  setCalendarStatus(familyId: string, uid: string, status: CalendarStatus | null): Promise<void>
}

/** Everything the calendar code needs from Google. Real impl: google.ts. Tests: a stub. */
export interface GoogleApi {
  /** Exchanges a GIS popup auth code. refreshToken is absent if Google didn't issue a new one. */
  exchangeCode(code: string): Promise<{ refreshToken?: string; email: string; scope: string }>
  listEvents(refreshToken: string, timeMin: Date, timeMax: Date): Promise<GoogleEvent[]>
  revoke(refreshToken: string): Promise<void>
}
