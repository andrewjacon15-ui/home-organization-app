/**
 * Turns household data into short plain text for Claude, and builds the documents its writes
 * add. No Firestore here: plain data in, text or plain objects out (format.test.ts).
 *
 * Text is the point: one line per thing, no ids or timestamps, so a whole week is a
 * couple of thousand tokens instead of tens of thousands of JSON.
 */
import { addDays, fromDateKey, toDateKey } from '../../../src/lib/dates'
import { buildManualEvent } from '../../../src/features/calendar/events'
import { occurrencesOn, toRepeat, type RepeatChoice } from '../../../src/features/chores/schedule'
import { groceryCategory } from '../../../functions/src/shared/recipes/groceryAisle'
import type { Chore, MealPlan } from '../../../src/types'

export interface Person {
  id: string
  name: string
  email: string
}

export interface Ev {
  title: string
  start: Date
  end: Date
  allDay: boolean
  startDate?: string
  endDate?: string
  location?: string
  who: string[]
}

export interface Item {
  id: string
  text: string
  memberId: string | null
  categoryId: string | null
  order: number
}

export interface List {
  id: string
  title: string
  kind: string
  sections: boolean
  autoSort?: boolean
  categories: { id: string; name: string }[]
  learned?: Record<string, string>
}

export interface Countdown {
  title: string
  date: string
  kind: string
}

export interface IndexEntry {
  t: string
  k: string[]
  m: number | null
  s: string
  b: string | null
  f: boolean
}

const dayLabel = (key: string) => fromDateKey(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const firstName = (p: Person) => p.name.split(' ')[0]

export function names(people: Person[], ids: string[]): string {
  if (people.length > 1 && people.every((p) => ids.includes(p.id))) return 'everyone'
  return ids.map((id) => people.find((p) => p.id === id)).filter((p): p is Person => !!p).map(firstName).join(', ')
}

/** The days an event is on, within [from, from + days). */
function eventDays(e: Ev, from: string, days: number): string[] {
  const last = addDays(from, days - 1)
  const first = e.allDay && e.startDate ? e.startDate : toDateKey(e.start)
  const end = e.allDay && e.endDate ? addDays(e.endDate, -1) : first
  const out: string[] = []
  for (let k = first < from ? from : first; k <= end && k <= last; k = addDays(k, 1)) out.push(k)
  return out
}

function eventLine(e: Ev, people: Person[]) {
  const when = e.allDay ? 'all day' : `${time(e.start)}–${time(e.end)}`
  const who = names(people, e.who)
  return `  ${when} ${e.title}${who ? ` (${who})` : ''}${e.location ? ` @ ${e.location}` : ''}`
}

/** Calendar, chores and meals day by day, then what's coming up. */
export function overview(a: { from: string; days: number; today: string; family: string; people: Person[]; events: Ev[]; chores: Chore[]; meals: Record<string, MealPlan>; countdowns: Countdown[] }): string {
  const out = [`${a.family} · ${dayLabel(a.from)} to ${dayLabel(addDays(a.from, a.days - 1))} · people: ${a.people.map(firstName).join(', ')}`]
  for (let i = 0; i < a.days; i++) {
    const day = addDays(a.from, i)
    out.push('', `${dayLabel(day)}${day === a.today ? ' (today)' : ''}`)
    const evs = a.events.filter((e) => eventDays(e, a.from, a.days).includes(day)).sort((x, y) => Number(y.allDay) - Number(x.allDay) || x.start.getTime() - y.start.getTime())
    for (const e of evs) out.push(eventLine(e, a.people))
    const chores = occurrencesOn(a.chores, day, a.today)
    if (chores.length) out.push(`  chores: ${chores.map((o) => choreText(o.chore, o.date, o.done, day, a.people)).join('; ')}`)
    const m = a.meals[day]
    const meals = m ? (['breakfast', 'lunch', 'dinner', 'notes'] as const).filter((s) => m[s]?.trim()).map((s) => `${s} ${m[s].trim()}`) : []
    if (meals.length) out.push(`  meals: ${meals.join(' · ')}`)
    if (!evs.length && !chores.length && !meals.length) out.push('  (nothing)')
  }
  const soon = upcoming(a.countdowns, a.today).slice(0, 6)
  if (soon.length) out.push('', `Countdowns: ${soon.join('; ')}`)
  return out.join('\n')
}

function choreText(c: Chore, date: string, done: boolean, day: string, people: Person[]) {
  const who = c.assigneeId ? names(people, [c.assigneeId]) : 'up for grabs'
  const late = date < day ? `, late since ${dayLabel(date)}` : ''
  return `${c.title} (${who}${c.dueTime ? ` ${c.dueTime}` : ''}${late})${done ? ' ✓' : ''}`
}

/** Countdowns from today on, soonest first ("Halloween in 5 days, Sat, Oct 31"). Yearly ones roll to their next date. */
export function upcoming(list: Countdown[], today: string): string[] {
  const year = Number(today.slice(0, 4))
  return list
    .map((c) => {
      let date = c.date
      if (c.kind === 'birthday' || c.kind === 'anniversary') {
        date = `${year}${c.date.slice(4)}`
        if (date < today) date = `${year + 1}${c.date.slice(4)}`
      }
      return { c, date }
    })
    .filter((x) => x.date >= today)
    .sort((x, y) => x.date.localeCompare(y.date))
    .map(({ c, date }) => {
      const n = Math.round((fromDateKey(date).getTime() - fromDateKey(today).getTime()) / 86_400_000)
      return `${c.title} ${n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`} (${dayLabel(date)})`
    })
}

/** Open items on a list, grouped the way the app shows them. */
export function listText(list: List, items: Item[], people: Person[]): string {
  const open = [...items].sort((a, b) => a.order - b.order)
  const out = [`${list.title} (${open.length} to get)`]
  if (!open.length) return out[0]
  const groups = new Map<string, string[]>()
  const add = (g: string, t: string) => groups.set(g, [...(groups.get(g) ?? []), t])
  for (const i of open) {
    const person = list.sections && i.memberId ? people.find((p) => p.id === i.memberId) : undefined
    const cat = list.categories.find((c) => c.id === i.categoryId)
    add(person ? firstName(person) : (cat?.name ?? (list.categories.length ? 'Other' : '')), i.text)
  }
  for (const [g, texts] of groups) out.push(g ? `${g}: ${texts.join(', ')}` : texts.join(', '))
  return out.join('\n')
}

/** Recipes whose title or ingredients match every word of the query (all of them for no query), best first. */
export function recipeText(entries: IndexEntry[], query: string, limit = 15): string {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = entries.filter((e) => words.every((w) => e.t.toLowerCase().includes(w) || e.k.some((k) => k.includes(w))))
  hits.sort((a, b) => Number(b.f) - Number(a.f) || a.t.localeCompare(b.t))
  if (!hits.length) return `No recipes match "${query}" (${entries.length} in the book).`
  const lines = hits.slice(0, limit).map((e) => `${e.f ? '★ ' : ''}${e.t}${e.m ? ` · ${e.m} min` : ''}${e.b ? ` · ${e.b}` : ''}`)
  return [`${hits.length} recipe${hits.length === 1 ? '' : 's'}${hits.length > limit ? `, first ${limit}` : ''}:`, ...lines].join('\n')
}

// ---------------------------------------------------------------------------
// Matching what Claude asked for to the household's own names.

const norm = (s: string) => s.trim().toLowerCase()

/** A person by first name, full name, or "me" (the person the server acts as). */
export function findPerson(people: Person[], name: string, me: Person): Person {
  const n = norm(name)
  if (n === 'me' || n === 'i') return me
  const hit = people.find((p) => norm(p.name) === n) ?? people.find((p) => norm(firstName(p)) === n)
  if (!hit) throw new Error(`No one called "${name}". People: ${people.map(firstName).join(', ')}.`)
  return hit
}

/** A list by its title, or a word of it ("grocery" → Grocery List). */
export function findList(lists: List[], name: string): List {
  const n = norm(name)
  const hit = lists.find((l) => norm(l.title) === n) ?? lists.filter((l) => norm(l.title).includes(n))
  if (!Array.isArray(hit)) return hit
  if (hit.length === 1) return hit[0]
  throw new Error(`${hit.length ? 'More than one' : 'No'} list matches "${name}". Lists: ${lists.map((l) => l.title).join(', ')}.`)
}

/** Open items matching each text: the same words, or the one item containing them. */
export function findItems(items: Item[], texts: string[]): { found: Item[]; missing: string[] } {
  const found: Item[] = []
  const missing: string[] = []
  for (const t of texts) {
    const n = norm(t)
    const exact = items.filter((i) => norm(i.text) === n)
    const loose = exact.length ? exact : items.filter((i) => norm(i.text).includes(n))
    if (loose.length === 1 || exact.length) found.push(loose[0])
    else missing.push(loose.length ? `${t} (matches ${loose.map((i) => i.text).join(', ')})` : t)
  }
  return { found: [...new Set(found)], missing }
}

// ---------------------------------------------------------------------------
// Documents for writes, field for field what the app itself writes.

/** Server time and timestamps come from the caller (Firestore's FieldValue / Timestamp). */
export interface Stamps<T> {
  now: T
  at: (d: Date) => T
}

export function listItemDocs<T>(list: List, open: Item[], texts: string[], memberId: string | null, by: string, s: Stamps<T>, base = Date.now()) {
  const have = new Set(open.map((i) => norm(i.text)))
  const fresh = [...new Set(texts.map((t) => t.trim()).filter(Boolean))].filter((t) => !have.has(norm(t)))
  const files = list.kind === 'grocery' && list.autoSort !== false && !memberId
  const docs = fresh.map((text, i) => ({
    text: text.slice(0, 300),
    done: false,
    memberId,
    categoryId: files ? groceryCategory(text, list.categories, list.learned) : null,
    order: base + i,
    createdBy: by,
    createdAt: s.now,
  }))
  return { docs, skipped: texts.filter((t) => have.has(norm(t))) }
}

export function checkOffFields<T>(keepDays: number, s: Stamps<T>, now = Date.now()) {
  return { done: true, doneAt: s.now, ...(keepDays > 0 ? { expireAt: s.at(new Date(now + keepDays * 86_400_000)) } : {}) }
}

export function eventDoc<T>(e: { title: string; date: string; start?: string; end?: string; memberIds: string[] }, by: string, s: Stamps<T>) {
  const allDay = !e.start
  const built = buildManualEvent({ title: e.title, date: e.date, allDay, startTime: e.start ?? '', endTime: e.end ?? '' })
  const { start, end, startDate, endDate, ...rest } = built
  return {
    ...rest,
    ...(e.memberIds.length ? { memberIds: e.memberIds } : {}),
    ...(startDate ? { startDate, endDate } : {}),
    start: s.at(start),
    end: s.at(end),
    source: 'manual',
    sourceUserId: by,
    createdAt: s.now,
  }
}

export type Repeat = RepeatChoice

export function choreDoc<T>(c: { title: string; assigneeId: string | null; date?: string; time?: string; repeat?: Repeat; days?: number[]; points?: number }, by: string, today: string, s: Stamps<T>) {
  const r = toRepeat(c.repeat ?? 'none', c.days?.length ? c.days : [fromDateKey(c.date || today).getDay()])
  return {
    title: c.title.trim().slice(0, 200),
    assigneeId: c.assigneeId,
    dueDate: c.date || (r ? today : null),
    ...(c.time && (c.date || r) ? { dueTime: c.time } : {}),
    points: Math.max(0, Math.floor(c.points ?? 1)),
    ...(r ? { repeat: r } : {}),
    done: false,
    createdBy: by,
    createdAt: s.now,
  }
}

export function countdownDoc<T>(title: string, date: string, kind: 'once' | 'birthday' | 'anniversary', by: string, s: Stamps<T>) {
  const [y, m, d] = date.split('-').map(Number)
  return {
    title: title.trim().slice(0, 80),
    date,
    createdBy: by,
    createdAt: s.now,
    ...(kind !== 'once' ? { kind } : { expireAt: s.at(new Date(Date.UTC(y, m - 1, d + 2))) }),
  }
}
