import { describe, expect, it, vi } from 'vitest'
import {
  choreOccursOn,
  choresForDay,
  dayKeyIn,
  digestEmail,
  dueDigests,
  dueEventReminders,
  eventReminderEmail,
  eventsOnDay,
  hourIn,
  inQuietHours,
  sendDueEmails,
  type Email,
  type Meals,
  type Person,
  type ReminderChore,
  type ReminderEvent,
  type ReminderPrefs,
  type ReminderStore,
} from './reminders.js'

const TZ = 'America/New_York'
// 2026-10-01 07:00 in New York (EDT, UTC-4).
const NOW = new Date('2026-10-01T11:00:00Z')

const ANDREW: Person = { id: 'a', displayName: 'Andrew', email: 'andrew@example.test' }
const LYDIA: Person = { id: 'l', displayName: 'Lydia', email: 'lydia@example.test' }

const prefs = (p: Partial<ReminderPrefs> = {}): ReminderPrefs => ({ eventEmailsEnabled: true, leadTimeMinutes: 30, dailyDigestEnabled: false, digestHourLocal: 7, timezone: TZ, ...p })

const ev = (id: string, startIso: string, minutes = 60, extra: Partial<ReminderEvent> = {}): ReminderEvent => {
  const start = new Date(startIso)
  return { id, title: id, start, end: new Date(start.getTime() + minutes * 60_000), allDay: false, sourceUserId: 'a', ...extra }
}

describe('time zone helpers', () => {
  it('reads the day and hour in the person’s zone', () => {
    expect(dayKeyIn(new Date('2026-10-01T02:00:00Z'), TZ)).toBe('2026-09-30')
    expect(hourIn(NOW, TZ)).toBe(7)
    expect(hourIn(NOW, 'America/Los_Angeles')).toBe(4)
  })
})

describe('dueEventReminders', () => {
  const owners = new Map<string, string[]>()

  it('fires once the lead time is reached, and not before or long after', () => {
    const p = new Map([['a', prefs()]])
    const at = (iso: string) => dueEventReminders([ev('dentist', iso)], [ANDREW], p, owners, TZ, NOW).length
    expect(at('2026-10-01T11:30:00Z')).toBe(1) // exactly 30 min out
    expect(at('2026-10-01T11:25:00Z')).toBe(1) // a few minutes late (scheduler lag)
    expect(at('2026-10-01T11:31:00Z')).toBe(0) // not yet
    expect(at('2026-10-01T11:10:00Z')).toBe(0) // too late to be useful
  })

  it('only emails people who opted in, about their own events', () => {
    const p = new Map([['a', prefs()], ['l', prefs({ eventEmailsEnabled: false })]])
    const events = [ev('mine', '2026-10-01T11:30:00Z'), ev('hers', '2026-10-01T11:30:00Z', 60, { sourceUserId: 'l' })]
    const due = dueEventReminders(events, [ANDREW, LYDIA], p, owners, TZ, NOW)
    expect(due.map((r) => `${r.person.id}:${r.event.title}`)).toEqual(['a:mine'])
  })

  it('follows calendar assignments and shared events, once per person', () => {
    const p = new Map([['a', prefs()], ['l', prefs()]])
    const assigned = new Map([['work', ['l']]])
    const events = [
      ev('Standup', '2026-10-01T11:30:00Z', 15, { calendarKey: 'work' }),
      ev('Dinner', '2026-10-01T11:30:00Z', 60, { memberIds: ['a', 'l'] }),
      ev('Dinner', '2026-10-01T11:30:00Z', 60, { id: 'dinner-copy', sourceUserId: 'l' }),
    ]
    const due = dueEventReminders(events, [ANDREW, LYDIA], p, assigned, TZ, NOW)
    expect(due.map((r) => `${r.person.id}:${r.event.title}`).sort()).toEqual(['a:Dinner', 'l:Dinner', 'l:Standup'])
  })

  it('skips all-day events and people without an email', () => {
    const p = new Map([['a', prefs()]])
    const allDay = ev('Holiday', '2026-10-01T11:30:00Z', 1440, { allDay: true })
    expect(dueEventReminders([allDay], [ANDREW], p, owners, TZ, NOW)).toEqual([])
    expect(dueEventReminders([ev('x', '2026-10-01T11:30:00Z')], [{ ...ANDREW, email: '' }], p, owners, TZ, NOW)).toEqual([])
  })
})

describe('dueDigests', () => {
  it('goes out in the person’s chosen local hour', () => {
    const p = new Map([['a', prefs({ dailyDigestEnabled: true, digestHourLocal: 7 })], ['l', prefs({ dailyDigestEnabled: true, digestHourLocal: 8 })]])
    expect(dueDigests([ANDREW, LYDIA], p, TZ, NOW).map((d) => [d.person.id, d.day, d.key])).toEqual([['a', '2026-10-01', 'd_a_2026-10-01']])
  })

  it('falls back to the family time zone, then a sane default', () => {
    const p = new Map([['a', prefs({ dailyDigestEnabled: true, digestHourLocal: 4, timezone: '' })]])
    expect(dueDigests([ANDREW], p, 'America/Los_Angeles', NOW)).toHaveLength(1)
    expect(dueDigests([ANDREW], new Map([['a', prefs({ dailyDigestEnabled: true, timezone: 'Not/AZone' })]]), undefined, NOW)).toHaveLength(1)
  })
})

describe('what the digest covers', () => {
  const owners = new Map<string, string[]>()

  it('includes timed events that touch the day (in the zone) and all-day events, all-day first', () => {
    const events = [
      ev('Late last night', '2026-10-01T02:00:00Z'), // Sept 30, 10 PM EDT
      ev('Lunch', '2026-10-01T16:00:00Z'),
      ev('Trip', '2026-09-29T00:00:00Z', 60 * 24 * 3, { allDay: true, startDate: '2026-09-29', endDate: '2026-10-02' }),
      ev('Lydia only', '2026-10-01T15:00:00Z', 60, { sourceUserId: 'l' }),
    ]
    expect(eventsOnDay(events, '2026-10-01', TZ, 'a', owners).map((e) => e.title)).toEqual(['Trip', 'Lunch'])
  })

  it('lists my chores and up-for-grabs chores due today, plus overdue one-offs', () => {
    const chores: ReminderChore[] = [
      { id: '1', title: 'Trash', assigneeId: 'a', dueDate: '2026-09-29', repeat: { freq: 'weekly', interval: 1, days: [4] }, done: false },
      { id: '2', title: 'Plants', assigneeId: null, dueDate: '2026-10-01', dueTime: '18:00', done: false },
      { id: '3', title: 'Old', assigneeId: 'a', dueDate: '2026-09-20', done: false },
      { id: '4', title: 'Hers', assigneeId: 'l', dueDate: '2026-10-01', done: false },
      { id: '5', title: 'Done already', assigneeId: 'a', dueDate: '2026-10-01', repeat: { freq: 'daily', interval: 1 }, completions: { '2026-10-01': 'a' }, done: false },
    ]
    expect(choresForDay(chores, '2026-10-01', 'a').map(({ chore, overdue }) => `${chore.title}${overdue ? '!' : ''}`)).toEqual(['Old!', 'Trash', 'Plants'])
  })

  it('matches the app’s repeat rules', () => {
    const c = (repeat: ReminderChore['repeat'], dueDate = '2026-01-31'): ReminderChore => ({ id: 'x', title: 'x', assigneeId: null, dueDate, repeat, done: false })
    expect(choreOccursOn(c({ freq: 'monthly', interval: 1 }), '2026-02-28')).toBe(true)
    expect(choreOccursOn(c({ freq: 'monthly', interval: 1 }), '2026-02-27')).toBe(false)
    expect(choreOccursOn(c({ freq: 'weekly', interval: 2, days: [1] }, '2026-09-28'), '2026-10-12')).toBe(true)
    expect(choreOccursOn(c({ freq: 'weekly', interval: 2, days: [1] }, '2026-09-28'), '2026-10-05')).toBe(false)
    expect(choreOccursOn(c({ freq: 'daily', interval: 3 }, '2026-10-01'), '2026-10-04')).toBe(true)
  })
})

describe('email bodies', () => {
  it('writes an event reminder in the person’s time zone and escapes HTML', () => {
    const e = ev('Soccer <practice>', '2026-10-01T22:00:00Z', 90, { location: 'Field 3' })
    const mail = eventReminderEmail({ key: 'k', person: ANDREW, event: e, tz: TZ, lead: 60 })
    expect(mail.to).toBe(ANDREW.email)
    expect(mail.subject).toBe('Soccer <practice> · 6:00 PM (in 1 hour)')
    expect(mail.text).toContain('Thursday, October 1, 6:00 PM – 7:30 PM')
    expect(mail.text).toContain('Where: Field 3')
    expect(mail.html).toContain('Soccer &lt;practice&gt;')
    expect(mail.html).not.toContain('<practice>')
  })

  it('writes a digest with every section, even when empty', () => {
    const d = { key: 'k', person: ANDREW, day: '2026-10-01', tz: TZ }
    const meals: Meals = { breakfast: 'Oats', dinner: 'Tacos', lunch: '', notes: '' }
    const mail = digestEmail(d, [ev('Lunch', '2026-10-01T16:00:00Z')], [], meals)
    expect(mail.subject).toBe('Today: 1 event, 0 chores · Thursday, October 1')
    expect(mail.text).toContain('• 12:00 PM – 1:00 PM — Lunch')
    expect(mail.text).toContain('No chores due.')
    expect(mail.text).toContain('• Breakfast: Oats')
    expect(mail.text).not.toContain('Lunch: ')
    expect(digestEmail(d, [], [], null).subject).toBe('Today: a clear day · Thursday, October 1')
  })
})

class FakeStore implements ReminderStore {
  claimed = new Set<string>()
  constructor(
    public prefs: Map<string, ReminderPrefs>,
    public events: ReminderEvent[] = [],
    public chores: ReminderChore[] = [],
    public quiet: { from: string; to: string } | null = null,
  ) {}
  async quietHours() {
    return this.quiet
  }
  async listFamilies() {
    return [{ id: 'f', name: 'Family', timezone: TZ }]
  }
  async listMembers() {
    return [ANDREW, LYDIA]
  }
  async listPrefs() {
    return this.prefs
  }
  async listCalendarOwners() {
    return new Map<string, string[]>()
  }
  async listEvents(_f: string, from: Date, to: Date) {
    return this.events.filter((e) => e.start >= from && e.start < to)
  }
  async listChores() {
    return this.chores
  }
  async getMeals() {
    return { dinner: 'Tacos' }
  }
  async claim(_f: string, key: string) {
    if (this.claimed.has(key)) return false
    this.claimed.add(key)
    return true
  }
}

describe('sendDueEmails', () => {
  it('sends no event reminders during the household’s quiet hours (digests still go out)', async () => {
    // NOW is 7:00 AM in New York; quiet until 7:30.
    const store = new FakeStore(new Map([['a', prefs({ dailyDigestEnabled: true })]]), [ev('Dentist', '2026-10-01T11:30:00Z')], [], { from: '21:00', to: '07:30' })
    const sent: Email[] = []
    expect(await sendDueEmails({ store, mailer: { send: async (m: Email) => void sent.push(m) } }, NOW)).toEqual({ eventEmails: 0, digests: 1, failures: 0 })
  })

  it('knows quiet hours that run past midnight, in the household’s zone', () => {
    const t = (iso: string) => new Date(iso)
    expect(inQuietHours(t('2026-10-02T02:30:00Z'), 'America/New_York', '21:00', '07:00')).toBe(true) // 10:30 PM
    expect(inQuietHours(t('2026-10-01T12:00:00Z'), 'America/New_York', '21:00', '07:00')).toBe(false) // 8:00 AM
    expect(inQuietHours(t('2026-10-01T17:00:00Z'), 'America/New_York', '12:00', '14:00')).toBe(true) // 1:00 PM
    expect(inQuietHours(t('2026-10-01T17:00:00Z'), 'America/New_York', '09:00', '09:00')).toBe(false)
  })

  it('sends each reminder and digest exactly once across repeated runs', async () => {
    const store = new FakeStore(new Map([['a', prefs({ dailyDigestEnabled: true })]]), [ev('Dentist', '2026-10-01T11:30:00Z')])
    const sent: Email[] = []
    const mailer = { send: async (m: Email) => void sent.push(m) }
    expect(await sendDueEmails({ store, mailer }, NOW)).toEqual({ eventEmails: 1, digests: 1, failures: 0 })
    expect(await sendDueEmails({ store, mailer }, new Date(NOW.getTime() + 5 * 60_000))).toEqual({ eventEmails: 0, digests: 0, failures: 0 })
    expect(sent.map((m) => m.subject)).toEqual(['Dentist · 7:30 AM (in 30 minutes)', 'Today: 1 event, 0 chores · Thursday, October 1'])
  })

  it('reads only the narrow window of events whose reminder is due, not the whole week', async () => {
    const store = new FakeStore(new Map([['a', prefs()], ['l', prefs({ leadTimeMinutes: 60 })]]), [ev('Dentist', '2026-10-01T11:30:00Z')])
    const windows: number[] = []
    const list = store.listEvents.bind(store)
    store.listEvents = async (f, from, to) => (windows.push(to.getTime() - from.getTime()), list(f, from, to))
    const owners = vi.spyOn(store, 'listCalendarOwners')
    await sendDueEmails({ store, mailer: { send: async () => undefined } }, NOW)
    // One window per lead time in use (30 and 60 minutes), each just the 15-minute grace period.
    expect(windows).toEqual([15 * 60_000 + 1, 15 * 60_000 + 1])
    expect(owners).toHaveBeenCalledTimes(1)

    // Nothing due and no digest: the calendar list isn't read at all.
    owners.mockClear()
    await sendDueEmails({ store, mailer: { send: async () => undefined } }, new Date(NOW.getTime() + 3 * 3600_000))
    expect(owners).not.toHaveBeenCalled()
  })

  it('does nothing for families where nobody opted in', async () => {
    const store = new FakeStore(new Map([['a', prefs({ eventEmailsEnabled: false })]]), [ev('Dentist', '2026-10-01T11:30:00Z')])
    const sent: Email[] = []
    expect(await sendDueEmails({ store, mailer: { send: async (m) => void sent.push(m) } }, NOW)).toEqual({ eventEmails: 0, digests: 0, failures: 0 })
    expect(sent).toEqual([])
  })

  it('logs a failed send without retrying it', async () => {
    const store = new FakeStore(new Map([['a', prefs()]]), [ev('Dentist', '2026-10-01T11:30:00Z')])
    const logs: string[] = []
    const failing = { send: async () => Promise.reject(new Error('535 bad credentials')) }
    expect(await sendDueEmails({ store, mailer: failing, log: (m) => void logs.push(m) }, NOW)).toEqual({ eventEmails: 0, digests: 0, failures: 1 })
    expect(logs).toEqual(['reminder email failed'])
  })
})
