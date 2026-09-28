/**
 * Reminder emails (spec milestone 5): an email N minutes before each of your events,
 * and a daily digest at your chosen local hour (today's events, chores, and meals).
 * Both run from one job every 5 minutes; each email is "claimed" in Firestore before
 * it's sent, so retries and overlapping runs never send the same email twice.
 */

export const APP_URL = 'https://home-organization-app-dkcbl.web.app'
/** How late a reminder may still go out (scheduler delays, a failed run). */
export const GRACE_MS = 15 * 60_000
const MAX_LEAD_MS = 10_080 * 60_000
const DEFAULT_TZ = 'America/New_York'

export interface ReminderPrefs {
  eventEmailsEnabled?: boolean
  leadTimeMinutes: number
  dailyDigestEnabled: boolean
  digestHourLocal: number
  timezone: string
}

export interface Person {
  id: string
  displayName: string
  email: string
}

export interface ReminderEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  startDate?: string
  endDate?: string
  location?: string
  sourceUserId: string
  calendarKey?: string
  memberIds?: string[]
}

export interface ReminderChore {
  id: string
  title: string
  assigneeId: string | null
  dueDate: string | null
  dueTime?: string | null
  repeat?: { freq: 'daily' | 'weekly' | 'monthly'; interval: number; days?: number[] } | null
  completions?: Record<string, string>
  done: boolean
}

export interface Meals {
  breakfast?: string
  lunch?: string
  dinner?: string
  notes?: string
}

export interface ReminderStore {
  listFamilies(): Promise<{ id: string; name: string; timezone?: string }[]>
  listMembers(familyId: string): Promise<Person[]>
  listPrefs(familyId: string): Promise<Map<string, ReminderPrefs>>
  /** Synced calendars that are assigned to people (key -> member ids). */
  listCalendarOwners(familyId: string): Promise<Map<string, string[]>>
  /** Events whose start is in [from, to). */
  listEvents(familyId: string, from: Date, to: Date): Promise<ReminderEvent[]>
  listChores(familyId: string): Promise<ReminderChore[]>
  getMeals(familyId: string, dateKey: string): Promise<Meals | null>
  /** Records that an email is going out. False if it was already claimed. */
  claim(familyId: string, key: string, expireAt: Date): Promise<boolean>
}

export interface Email {
  to: string
  subject: string
  text: string
  html: string
}

export interface Mailer {
  send(email: Email): Promise<void>
}

// ---------------------------------------------------------------------------
// Time zones and dates

/** YYYY-MM-DD for `d` in time zone `tz`. */
export function dayKeyIn(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** 0-23 hour of `d` in time zone `tz`. */
export function hourIn(d: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(d))
}

function safeTz(tz: string | undefined): string {
  if (!tz) return DEFAULT_TZ
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return DEFAULT_TZ
  }
}

const timeIn = (d: Date, tz: string) => d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
const longDate = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })

const utcDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const daysBetween = (a: string, b: string) => Math.round((utcDay(b) - utcDay(a)) / 86_400_000)
const weekday = (key: string) => new Date(utcDay(key)).getUTCDay()
const addDays = (key: string, n: number) => new Date(utcDay(key) + n * 86_400_000).toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Chores (mirrors src/features/chores/schedule.ts occursOn / isDoneOn)

export function choreOccursOn(chore: ReminderChore, key: string): boolean {
  const r = chore.repeat
  if (!r) return chore.dueDate === key
  const anchor = chore.dueDate
  if (!anchor || key < anchor) return false
  const n = Math.max(1, r.interval)
  switch (r.freq) {
    case 'daily':
      return daysBetween(anchor, key) % n === 0
    case 'weekly': {
      const days = r.days?.length ? r.days : [weekday(anchor)]
      if (!days.includes(weekday(key))) return false
      const weekOf = (k: string) => addDays(k, -weekday(k))
      return Math.round(daysBetween(weekOf(anchor), weekOf(key)) / 7) % n === 0
    }
    case 'monthly': {
      const [ay, am, ad] = anchor.split('-').map(Number)
      const [ky, km, kd] = key.split('-').map(Number)
      if (((ky - ay) * 12 + (km - am)) % n !== 0) return false
      const lastDay = new Date(Date.UTC(ky, km, 0)).getUTCDate()
      return kd === Math.min(ad, lastDay)
    }
  }
}

const choreDoneOn = (c: ReminderChore, key: string) => (c.repeat ? !!c.completions && key in c.completions : c.done)

// ---------------------------------------------------------------------------
// Who an event belongs to (mirrors ownersOf in src/features/calendar/views.ts)

export function ownersOf(e: ReminderEvent, calendarOwners: Map<string, string[]>): string[] {
  if (e.memberIds?.length) return e.memberIds
  const cal = e.calendarKey ? calendarOwners.get(e.calendarKey) : undefined
  return cal?.length ? cal : [e.sourceUserId]
}

/** Short stable hash for Firestore doc ids. */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

// ---------------------------------------------------------------------------
// What's due

export interface EventReminder {
  key: string
  person: Person
  event: ReminderEvent
  tz: string
  lead: number
}

/**
 * Event reminders whose moment (start - lead) is in (now - GRACE, now]. The same event
 * on two people's calendars counts once per person (it is keyed by title + time).
 */
export function dueEventReminders(
  events: ReminderEvent[],
  people: Person[],
  prefs: Map<string, ReminderPrefs>,
  calendarOwners: Map<string, string[]>,
  familyTz: string | undefined,
  now: Date,
): EventReminder[] {
  const out = new Map<string, EventReminder>()
  for (const person of people) {
    const p = prefs.get(person.id)
    if (!p?.eventEmailsEnabled || !person.email) continue
    const lead = Math.max(0, p.leadTimeMinutes)
    for (const e of events) {
      if (e.allDay) continue
      const at = e.start.getTime() - lead * 60_000
      if (at > now.getTime() || at <= now.getTime() - GRACE_MS) continue
      if (!ownersOf(e, calendarOwners).includes(person.id)) continue
      const key = `e_${person.id}_${e.start.getTime()}_${lead}_${hash(`${e.title}|${e.end.getTime()}`)}`
      out.set(key, { key, person, event: e, tz: safeTz(p.timezone || familyTz), lead })
    }
  }
  return [...out.values()]
}

export interface Digest {
  key: string
  person: Person
  day: string
  tz: string
}

/** People whose digest hour it is right now in their time zone. */
export function dueDigests(people: Person[], prefs: Map<string, ReminderPrefs>, familyTz: string | undefined, now: Date): Digest[] {
  const out: Digest[] = []
  for (const person of people) {
    const p = prefs.get(person.id)
    if (!p?.dailyDigestEnabled || !person.email) continue
    const tz = safeTz(p.timezone || familyTz)
    if (hourIn(now, tz) !== p.digestHourLocal) continue
    const day = dayKeyIn(now, tz)
    out.push({ key: `d_${person.id}_${day}`, person, day, tz })
  }
  return out
}

/** Events that touch `day` (in `tz`) and belong to `personId`, in start order. */
export function eventsOnDay(events: ReminderEvent[], day: string, tz: string, personId: string, calendarOwners: Map<string, string[]>): ReminderEvent[] {
  const seen = new Set<string>()
  return events
    .filter((e) => {
      if (!ownersOf(e, calendarOwners).includes(personId)) return false
      if (e.allDay) {
        const start = e.startDate ?? e.start.toISOString().slice(0, 10)
        const end = e.endDate ?? e.end.toISOString().slice(0, 10)
        return start <= day && day < end
      }
      return dayKeyIn(e.start, tz) <= day && dayKeyIn(new Date(e.end.getTime() - 1), tz) >= day
    })
    .filter((e) => {
      const k = `${e.title}|${e.start.getTime()}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime())
}

/** Chores for `personId` (theirs or up for grabs) due on `day`, plus their overdue one-offs. */
export function choresForDay(chores: ReminderChore[], day: string, personId: string): { chore: ReminderChore; overdue: boolean }[] {
  const mine = chores.filter((c) => c.assigneeId === personId || c.assigneeId === null)
  const today = mine.filter((c) => choreOccursOn(c, day) && !choreDoneOn(c, day)).map((chore) => ({ chore, overdue: false }))
  const overdue = mine.filter((c) => !c.repeat && c.dueDate && c.dueDate < day && !c.done).map((chore) => ({ chore, overdue: true }))
  return [...overdue, ...today]
}

// ---------------------------------------------------------------------------
// Email bodies

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function leadLabel(n: number) {
  if (n === 0) return 'now'
  if (n % 1440 === 0) return n === 1440 ? 'in 1 day' : `in ${n / 1440} days`
  if (n % 60 === 0) return n === 60 ? 'in 1 hour' : `in ${n / 60} hours`
  return n > 60 ? `in ${Math.floor(n / 60)} hr ${n % 60} min` : `in ${n} minutes`
}

function page(heading: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f4ee;color:#1b1a17;font-family:Georgia,'Times New Roman',serif">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<h1 style="font-weight:400;font-size:26px;margin:0 0 16px;border-bottom:1px solid #1b1a17;padding-bottom:10px">${heading}</h1>
${bodyHtml}
<p style="margin-top:28px;font:13px/1.5 -apple-system,'Segoe UI',sans-serif;color:#5d5950">
<a href="${APP_URL}" style="color:#1d4ed8">Open Family Organizer</a> · Change or turn off these emails in Settings → Email reminders.</p>
</div></body></html>`
}

export function eventReminderEmail(r: EventReminder): Email {
  const { event: e, tz } = r
  const when = `${timeIn(e.start, tz)} – ${timeIn(e.end, tz)}`
  const day = longDate(dayKeyIn(e.start, tz))
  const subject = `${e.title} · ${leadLabel(r.lead) === 'now' ? 'starting now' : `${timeIn(e.start, tz)} (${leadLabel(r.lead)})`}`
  const text = [`${e.title}`, `${day}, ${when}`, e.location ? `Where: ${e.location}` : '', '', `Open Family Organizer: ${APP_URL}`].filter((l, i) => l || i === 3).join('\n')
  const html = page(
    esc(e.title),
    `<p style="font-size:18px;margin:0 0 6px">${esc(day)}</p>
<p style="font-size:18px;margin:0 0 6px">${esc(when)} <span style="color:#5d5950">· ${esc(leadLabel(r.lead))}</span></p>
${e.location ? `<p style="margin:0;color:#5d5950">${esc(e.location)}</p>` : ''}`,
  )
  return { to: r.person.email, subject, text, html }
}

export function digestEmail(d: Digest, events: ReminderEvent[], chores: { chore: ReminderChore; overdue: boolean }[], meals: Meals | null): Email {
  const when = (e: ReminderEvent) => (e.allDay ? 'All day' : `${timeIn(e.start, d.tz)} – ${timeIn(e.end, d.tz)}`)
  const mealLines = (['breakfast', 'lunch', 'dinner'] as const).filter((m) => meals?.[m]?.trim()).map((m) => `${m[0].toUpperCase()}${m.slice(1)}: ${meals![m]!.trim()}`)
  if (meals?.notes?.trim()) mealLines.push(`Notes: ${meals.notes.trim()}`)
  const choreLine = ({ chore, overdue }: { chore: ReminderChore; overdue: boolean }) =>
    `${chore.title}${overdue ? ' (overdue)' : chore.dueTime ? ` · by ${formatHHMM(chore.dueTime)}` : ''}${chore.assigneeId === null ? ' · up for grabs' : ''}`

  const sections: { title: string; lines: string[]; empty: string }[] = [
    { title: 'Calendar', lines: events.map((e) => `${when(e)} — ${e.title}${e.location ? ` (${e.location})` : ''}`), empty: 'Nothing on the calendar.' },
    { title: 'Chores', lines: chores.map(choreLine), empty: 'No chores due.' },
    { title: 'Meals', lines: mealLines, empty: 'No meals planned.' },
  ]
  const heading = longDate(d.day)
  const text = [heading, '', ...sections.flatMap((s) => [s.title.toUpperCase(), ...(s.lines.length ? s.lines.map((l) => `• ${l}`) : [s.empty]), '']), `Open Family Organizer: ${APP_URL}`].join('\n')
  const html = page(
    esc(heading),
    sections
      .map(
        (s) => `<h2 style="font:600 12px -apple-system,'Segoe UI',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#5d5950;margin:22px 0 8px">${s.title}</h2>
${s.lines.length ? `<ul style="margin:0;padding-left:18px;font-size:16px;line-height:1.6">${s.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : `<p style="margin:0;color:#5d5950">${s.empty}</p>`}`,
      )
      .join('\n'),
  )
  const count = events.length + chores.length
  return { to: d.person.email, subject: `Today: ${count === 0 ? 'a clear day' : `${events.length} event${events.length === 1 ? '' : 's'}, ${chores.length} chore${chores.length === 1 ? '' : 's'}`} · ${heading}`, text, html }
}

function formatHHMM(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// ---------------------------------------------------------------------------
// The job

export interface RunResult {
  eventEmails: number
  digests: number
  failures: number
}

export async function sendDueEmails(deps: { store: ReminderStore; mailer: Mailer; log?: (msg: string, extra?: object) => void }, now = new Date()): Promise<RunResult> {
  const { store, mailer, log = () => undefined } = deps
  const result: RunResult = { eventEmails: 0, digests: 0, failures: 0 }

  const send = async (familyId: string, key: string, email: Email) => {
    if (!(await store.claim(familyId, key, new Date(now.getTime() + 8 * 86_400_000)))) return false
    try {
      await mailer.send(email)
      return true
    } catch (err) {
      // Claimed but not sent: better one missed reminder than a burst of duplicates.
      result.failures++
      log('reminder email failed', { familyId, key, error: err instanceof Error ? err.message : String(err) })
      return false
    }
  }

  for (const family of await store.listFamilies()) {
    const prefs = await store.listPrefs(family.id)
    const wantsAny = [...prefs.values()].some((p) => p.eventEmailsEnabled || p.dailyDigestEnabled)
    if (!wantsAny) continue
    const [people, calendarOwners] = await Promise.all([store.listMembers(family.id), store.listCalendarOwners(family.id)])

    const upcoming = await store.listEvents(family.id, new Date(now.getTime() - GRACE_MS), new Date(now.getTime() + MAX_LEAD_MS + GRACE_MS))
    for (const r of dueEventReminders(upcoming, people, prefs, calendarOwners, family.timezone, now)) {
      if (await send(family.id, r.key, eventReminderEmail(r))) result.eventEmails++
    }

    const digests = dueDigests(people, prefs, family.timezone, now)
    if (digests.length) {
      // Multi-day events can start well before today.
      const recent = await store.listEvents(family.id, new Date(now.getTime() - 14 * 86_400_000), new Date(now.getTime() + 2 * 86_400_000))
      const chores = await store.listChores(family.id)
      for (const d of digests) {
        const meals = await store.getMeals(family.id, d.day)
        const email = digestEmail(d, eventsOnDay(recent, d.day, d.tz, d.person.id, calendarOwners), choresForDay(chores, d.day, d.person.id), meals)
        if (await send(family.id, d.key, email)) result.digests++
      }
    }
  }
  return result
}
