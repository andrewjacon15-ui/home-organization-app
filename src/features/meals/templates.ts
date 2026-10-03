import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
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
}

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
    onChange(snap.docs.map((d) => ({ id: d.id, name: d.get('name'), days: (d.get('days') ?? []).map(clean) }))),
  )
}

export function saveTemplate(familyId: string, userId: string, name: string, days: MealPlan[]) {
  return addDoc(col(familyId), { name: name.trim().slice(0, 60), days: days.map(clean), createdBy: userId, createdAt: serverTimestamp() })
}

export const deleteTemplate = (familyId: string, id: string) => deleteDoc(doc(col(familyId), id))
