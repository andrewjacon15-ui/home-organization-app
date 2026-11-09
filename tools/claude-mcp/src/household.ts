/**
 * The household in Firestore, for the MCP server: narrow reads (a date range, one list, the
 * recipe index) with a short cache, and writes that only add or check things off.
 *
 * Signs in with a service account (GOOGLE_APPLICATION_CREDENTIALS), which skips the security
 * rules, so these functions are the limit on what Claude can do: nothing here deletes.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { addDays, toDateKey } from '../../../src/lib/dates'
import type { Chore, MealPlan } from '../../../src/types'
import * as f from './format'

const READ_TTL = 2 * 60_000
const SLOW_TTL = 10 * 60_000

const stamps: f.Stamps<FieldValue | Timestamp> = { now: FieldValue.serverTimestamp(), at: (d) => Timestamp.fromDate(d) }

export class Household {
  private cache = new Map<string, { at: number; value: unknown }>()
  private constructor(
    private db: Firestore,
    readonly familyId: string,
    private actorEmail: string | undefined,
  ) {}

  /** FAMILY_ID picks the household; without it, the only one there is. MEMBER_EMAIL is who writes are "by" (default: the owner). */
  static async open(env = process.env): Promise<Household> {
    initializeApp({ credential: applicationDefault() })
    const db = getFirestore()
    let familyId = env.FAMILY_ID
    if (!familyId) {
      const snap = await db.collection('families').limit(5).get()
      if (snap.size !== 1) throw new Error(`Set FAMILY_ID. Households: ${snap.docs.map((d) => `${d.id} (${d.get('name')})`).join(', ') || 'none'}`)
      familyId = snap.docs[0].id
    }
    return new Household(db, familyId, env.MEMBER_EMAIL?.toLowerCase())
  }

  private async cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < ttl) return hit.value as T
    const value = await load()
    this.cache.set(key, { at: Date.now(), value })
    return value
  }

  /** After a write, reads start fresh (the slow-changing basics stay). */
  private changed() {
    for (const k of this.cache.keys()) if (!k.startsWith('slow:')) this.cache.delete(k)
  }

  private get fam() {
    return this.db.collection('families').doc(this.familyId)
  }

  // --- Basics: the household, its people, settings, calendars -------------------------------

  basics() {
    return this.cached('slow:basics', SLOW_TTL, async () => {
      const [fam, members, display, calendars] = await Promise.all([this.fam.get(), this.fam.collection('members').get(), this.fam.collection('settings').doc('display').get(), this.fam.collection('calendars').get()])
      const people: f.Person[] = members.docs.map((d) => ({ id: d.id, name: String(d.get('displayName') ?? ''), email: String(d.get('email') ?? '').toLowerCase() }))
      const owner = String(fam.get('ownerId') ?? '')
      const me = people.find((p) => p.email === this.actorEmail) ?? people.find((p) => p.id === owner) ?? people[0]
      const cal = new Map(calendars.docs.map((d) => [d.id, { enabled: d.get('enabled') !== false, memberIds: (d.get('memberIds') as string[] | undefined) ?? [] }]))
      return { name: String(fam.get('name') ?? 'Household'), people, me, keepDays: Number(display.get('listDoneDays') ?? 30), cal }
    })
  }

  // --- Reads ---------------------------------------------------------------------------------

  async overview(from: string, days: number): Promise<string> {
    const b = await this.basics()
    const to = addDays(from, days)
    const [events, chores, meals, countdowns] = await Promise.all([this.events(from, to), this.chores(), this.meals(from, days), this.countdowns()])
    return f.overview({ from, days, today: toDateKey(new Date()), family: b.name, people: b.people, events, chores, meals, countdowns })
  }

  private events(from: string, to: string): Promise<f.Ev[]> {
    return this.cached(`events:${from}:${to}`, READ_TTL, async () => {
      const b = await this.basics()
      // A week back catches multi-day events that started earlier (all-day ones start at UTC midnight).
      const since = new Date(new Date(`${from}T00:00`).getTime() - 7 * 86_400_000)
      const snap = await this.fam.collection('events').where('start', '>=', Timestamp.fromDate(since)).where('start', '<', Timestamp.fromDate(new Date(`${to}T00:00`))).get()
      return snap.docs.flatMap((d) => {
        const x = d.data()
        const cal = x.calendarKey ? b.cal.get(x.calendarKey) : undefined
        if (cal && !cal.enabled) return []
        const who: string[] = x.memberIds?.length ? x.memberIds : cal?.memberIds.length ? cal.memberIds : [x.sourceUserId]
        return [{ title: String(x.title ?? ''), start: x.start.toDate(), end: x.end.toDate(), allDay: !!x.allDay, startDate: x.startDate, endDate: x.endDate, location: x.location, who }]
      })
    })
  }

  private chores(): Promise<Chore[]> {
    return this.cached('chores', READ_TTL, async () => (await this.fam.collection('chores').get()).docs.map((d) => ({ id: d.id, ...d.data() }) as Chore))
  }

  private meals(from: string, days: number): Promise<Record<string, MealPlan>> {
    return this.cached(`meals:${from}:${days}`, READ_TTL, async () => {
      const refs = Array.from({ length: days }, (_, i) => this.fam.collection('mealPlans').doc(addDays(from, i)))
      const snaps = await this.db.getAll(...refs)
      return Object.fromEntries(snaps.filter((s) => s.exists).map((s) => [s.id, s.data() as MealPlan]))
    })
  }

  private countdowns(): Promise<f.Countdown[]> {
    return this.cached('countdowns', READ_TTL, async () => (await this.fam.collection('countdowns').get()).docs.map((d) => ({ title: String(d.get('title') ?? ''), date: String(d.get('date') ?? ''), kind: String(d.get('kind') ?? 'once') })))
  }

  lists(): Promise<f.List[]> {
    return this.cached('slow:lists', SLOW_TTL, async () =>
      (await this.fam.collection('lists').orderBy('order').get()).docs.map((d) => ({
        id: d.id,
        title: String(d.get('title') ?? ''),
        kind: String(d.get('kind') ?? 'custom'),
        sections: !!d.get('sections'),
        autoSort: d.get('autoSort'),
        categories: (d.get('categories') as f.List['categories'] | undefined) ?? [],
        learned: d.get('learned'),
      })),
    )
  }

  /** Open items only: checked-off ones are never read. */
  openItems(listId: string): Promise<f.Item[]> {
    return this.cached(`items:${listId}`, READ_TTL, async () =>
      (await this.fam.collection('lists').doc(listId).collection('items').where('done', '==', false).get()).docs.map((d) => ({
        id: d.id,
        text: String(d.get('text') ?? ''),
        memberId: d.get('memberId') ?? null,
        categoryId: d.get('categoryId') ?? null,
        order: Number(d.get('order') ?? 0),
      })),
    )
  }

  async listSummary(name?: string): Promise<string> {
    const [b, lists] = await Promise.all([this.basics(), this.lists()])
    const chosen = name ? [f.findList(lists, name)] : lists
    const parts = await Promise.all(chosen.map(async (l) => f.listText(l, await this.openItems(l.id), b.people)))
    return parts.join('\n\n')
  }

  async recipes(query: string): Promise<string> {
    const entries = await this.cached('slow:recipes', SLOW_TTL, async () => {
      const snap = await this.fam.collection('recipeIndex').get()
      return snap.docs.filter((d) => d.id !== 'meta').flatMap((d) => Object.values((d.get('e') as Record<string, f.IndexEntry> | undefined) ?? {}))
    })
    return f.recipeText(entries, query)
  }

  // --- Writes: add and check off, never delete -----------------------------------------------

  async addListItems(listName: string, texts: string[], person?: string): Promise<string> {
    const [b, lists] = await Promise.all([this.basics(), this.lists()])
    const list = f.findList(lists, listName)
    const memberId = person && list.sections ? f.findPerson(b.people, person, b.me).id : null
    const { docs, skipped } = f.listItemDocs(list, await this.openItems(list.id), texts, memberId, b.me.id, stamps)
    if (docs.length) {
      const batch = this.db.batch()
      const col = this.fam.collection('lists').doc(list.id).collection('items')
      for (const d of docs) batch.set(col.doc(), d)
      await batch.commit()
      this.changed()
    }
    return `Added ${docs.length} to ${list.title}${docs.length ? `: ${docs.map((d) => d.text).join(', ')}` : ''}.${skipped.length ? ` Already on it: ${skipped.join(', ')}.` : ''}`
  }

  async checkOff(listName: string, texts: string[]): Promise<string> {
    const [b, lists] = await Promise.all([this.basics(), this.lists()])
    const list = f.findList(lists, listName)
    const { found, missing } = f.findItems(await this.openItems(list.id), texts)
    if (found.length) {
      const batch = this.db.batch()
      const col = this.fam.collection('lists').doc(list.id).collection('items')
      for (const i of found) batch.update(col.doc(i.id), f.checkOffFields(b.keepDays, stamps))
      await batch.commit()
      this.changed()
    }
    return `Checked off ${found.length} on ${list.title}${found.length ? `: ${found.map((i) => i.text).join(', ')}` : ''}.${missing.length ? ` Not found: ${missing.join('; ')}.` : ''}`
  }

  async addEvent(e: { title: string; date: string; start?: string; end?: string; people?: string[] }): Promise<string> {
    const b = await this.basics()
    const who = (e.people?.length ? e.people : ['me']).map((n) => f.findPerson(b.people, n, b.me).id)
    await this.fam.collection('events').add(f.eventDoc({ ...e, memberIds: who }, b.me.id, stamps))
    this.changed()
    return `Added "${e.title}" on ${e.date}${e.start ? ` at ${e.start}` : ' (all day)'} for ${f.names(b.people, who)}.`
  }

  async addChore(c: { title: string; person?: string; date?: string; time?: string; repeat?: f.Repeat; days?: number[]; points?: number }): Promise<string> {
    const b = await this.basics()
    const assigneeId = c.person ? f.findPerson(b.people, c.person, b.me).id : null
    await this.fam.collection('chores').add(f.choreDoc({ ...c, assigneeId }, b.me.id, toDateKey(new Date()), stamps))
    this.changed()
    return `Added chore "${c.title}" for ${assigneeId ? f.names(b.people, [assigneeId]) : 'up for grabs'}${c.repeat && c.repeat !== 'none' ? `, ${c.repeat}` : ''}${c.date ? ` from ${c.date}` : ''}.`
  }

  /** Fills in or replaces the given meals for a day; the others stay as they are. */
  async setMeals(date: string, meals: Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'notes', string>>): Promise<string> {
    const b = await this.basics()
    const ref = this.fam.collection('mealPlans').doc(date)
    const current = (await ref.get()).data() ?? {}
    const plan = { breakfast: '', lunch: '', dinner: '', notes: '', ...current, ...meals, updatedBy: b.me.id }
    await ref.set(plan)
    this.changed()
    return `Meals for ${date}: ${(['breakfast', 'lunch', 'dinner', 'notes'] as const).map((s) => `${s} ${plan[s] || '-'}`).join(' · ')}. (Groceries for these aren't added automatically; use add_list_items if needed.)`
  }

  async addCountdown(title: string, date: string, kind: 'once' | 'birthday' | 'anniversary' = 'once'): Promise<string> {
    const b = await this.basics()
    await this.fam.collection('countdowns').add(f.countdownDoc(title, date, kind, b.me.id, stamps))
    this.changed()
    return `Added countdown "${title}" (${date}).`
  }
}
