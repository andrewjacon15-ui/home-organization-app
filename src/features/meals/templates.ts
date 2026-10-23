import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { removeDocs } from '../../lib/undo'
import { db } from '../../firebase'
import { addDays, fromDateKey } from '../../lib/dates'
import type { MealPlan } from '../../types'
import type { PlannedMeal, PlannedSlot } from './upcomingMeals'

/**
 * A meal-plan template: a named week of meals ("School week", "Taco Tuesday") kept by
 * weekday (0 = Sunday), so it lands on the right days whichever day the week starts on.
 * families/{f}/mealTemplates/{id}.
 */
export interface MealTemplate {
  id: string
  name: string
  /** Seven days, Sunday first. */
  days: MealPlan[]
  /** How many it's planned for (scales its groceries); null = as each recipe is written. */
  people: number | null
  /** The meals it plans, in order (older templates: whichever meals they have). */
  meals: PlannedSlot[]
}

/** What a template is made of, before it's saved. */
export type TemplateDraft = Omit<MealTemplate, 'id'>

export type ApplyMode = 'fill' | 'replace'

const EMPTY: MealPlan = { breakfast: '', lunch: '', dinner: '', notes: '' }
const SLOTS: PlannedSlot[] = ['breakfast', 'lunch', 'dinner']
const col = (familyId: string) => collection(db, 'families', familyId, 'mealTemplates')
const weekday = (date: string) => fromDateKey(date).getDay()
const clean = (p: Partial<MealPlan> | undefined): MealPlan => ({
  breakfast: (p?.breakfast ?? '').trim().slice(0, 200),
  lunch: (p?.lunch ?? '').trim().slice(0, 200),
  dinner: (p?.dinner ?? '').trim().slice(0, 200),
  notes: (p?.notes ?? '').trim().slice(0, 200),
})

/** The week starting `weekStart` as a template's seven days. */
export function templateFromWeek(plans: Record<string, MealPlan>, weekStart: string): MealPlan[] {
  const days = Array.from({ length: 7 }, () => ({ ...EMPTY }))
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i)
    days[weekday(date)] = clean(plans[date])
  }
  return days
}

export const isEmptyPlan = (p: MealPlan) => !p.breakfast && !p.lunch && !p.dinner && !p.notes

/** The meals a template's days use, in order (Dinner when it has none yet). */
export function mealsUsed(days: MealPlan[]): PlannedSlot[] {
  const used = SLOTS.filter((s) => days.some((d) => d[s]))
  return used.length ? used : ['dinner']
}

const readMeals = (v: unknown, days: MealPlan[]): PlannedSlot[] => {
  const list = Array.isArray(v) ? SLOTS.filter((s) => v.includes(s)) : []
  return list.length ? list : mealsUsed(days)
}

const readPeople = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 30 ? v : null)

/** An empty week of the given meals, for a new template. */
export const blankTemplate = (meals: PlannedSlot[] = ['dinner'], people: number | null = null): TemplateDraft => ({ name: '', days: Array.from({ length: 7 }, () => ({ ...EMPTY })), people, meals })

/**
 * What applying a template to a week changes: each day's new plan (only days that change),
 * and the meals the template put there (for the grocery list). "fill" keeps what's already
 * planned and only fills empty meals; "replace" makes the week match the template.
 */
export function applyTemplate(t: Pick<MealTemplate, 'days'>, weekStart: string, current: Record<string, MealPlan>, mode: ApplyMode): { changes: Record<string, MealPlan>; added: Omit<PlannedMeal, 'recipeId'>[] } {
  const changes: Record<string, MealPlan> = {}
  const added: Omit<PlannedMeal, 'recipeId'>[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i)
    const from = clean(t.days[weekday(date)])
    const was = clean(current[date])
    const next: MealPlan = mode === 'replace' ? { ...from } : { ...was }
    if (mode === 'fill') {
      for (const k of [...SLOTS, 'notes'] as const) if (!was[k] && from[k]) next[k] = from[k]
    }
    for (const slot of SLOTS) if (from[slot] && next[slot] === from[slot] && was[slot] !== from[slot]) added.push({ date, slot, text: from[slot] })
    if (JSON.stringify(next) !== JSON.stringify(was)) changes[date] = next
  }
  return { changes, added }
}

export function watchTemplates(familyId: string, onChange: (list: MealTemplate[]) => void) {
  return onSnapshot(query(col(familyId), orderBy('name')), (snap) =>
    onChange(
      snap.docs.map((d) => {
        const days = ((d.get('days') ?? []) as Partial<MealPlan>[]).map(clean)
        return { id: d.id, name: d.get('name'), days, people: readPeople(d.get('people')), meals: readMeals(d.get('meals'), days) }
      }),
    ),
  )
}

const fields = (t: TemplateDraft) => {
  // Meals that aren't part of it are left blank, so turning one off really removes it.
  const days = t.days.map((d) => {
    const c = clean(d)
    for (const s of SLOTS) if (!t.meals.includes(s)) c[s] = ''
    return c
  })
  return { name: t.name.trim().slice(0, 60), days, people: t.people, meals: SLOTS.filter((s) => t.meals.includes(s)) }
}

export function saveTemplate(familyId: string, userId: string, t: TemplateDraft) {
  return addDoc(col(familyId), { ...fields(t), createdBy: userId, createdAt: serverTimestamp() })
}

export function updateTemplate(familyId: string, id: string, t: TemplateDraft) {
  return updateDoc(doc(col(familyId), id), { ...fields(t), updatedAt: serverTimestamp() })
}

export const deleteTemplate = (familyId: string, id: string) => removeDocs([doc(col(familyId), id)])
