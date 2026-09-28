export interface Family {
  id: string
  name: string
  ownerId: string
  timezone: string
}

export interface Member {
  id: string
  displayName: string
  email: string
  color: string
  photoURL?: string
  calendar?: MemberCalendarStatus
}

export interface Invite {
  email: string
  familyId: string
  invitedBy: string
}

export interface Chore {
  id: string
  title: string
  assigneeId: string | null
  /** YYYY-MM-DD, or null for "whenever". */
  dueDate: string | null
  /** HH:MM, optional. Chores with a time can trigger "when due" reminders. */
  dueTime?: string | null
  done: boolean
  points: number
}

export type NewChore = Omit<Chore, 'id' | 'done'>

export interface MealPlan {
  breakfast: string
  lunch: string
  dinner: string
  notes: string
}

export type MealSlot = keyof MealPlan

export interface CalendarEvent {
  id: string
  source: 'google' | 'manual'
  sourceUserId: string
  /** Manual events: who the event is for (defaults to the creator). */
  memberIds?: string[]
  /** Synced events: which of the person's Google calendars it came from. */
  calendarKey?: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  /** All-day only: YYYY-MM-DD, end exclusive. */
  startDate?: string
  endDate?: string
  location?: string
}

export type NewManualEvent = Pick<CalendarEvent, 'title' | 'start' | 'end' | 'allDay' | 'startDate' | 'endDate' | 'memberIds'>

/** Written by Cloud Functions onto the member doc. */
export type MemberCalendarStatus =
  | { status: 'connected'; email: string; lastSyncAt?: { toDate(): Date }; eventCount?: number }
  | { status: 'needs_reconnect'; email: string; error?: string }

/** One of a person's Google calendars (families/{id}/calendars/{key}), mirrored by the sync function. */
export interface SyncedCalendar {
  key: string
  ownerId: string
  calendarId: string
  /** Google's name for it. */
  name: string
  /** The family's nickname, if set. */
  alias?: string
  googleColor: string
  color: string
  enabled: boolean
  primary: boolean
  /** Whose calendar this is on the family board (a shared "Family" calendar can be several people's). */
  memberIds: string[]
}
