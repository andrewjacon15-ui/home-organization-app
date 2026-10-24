import { collection, deleteDoc, doc, documentId, getDocs, onSnapshot, query, setDoc, where, writeBatch, type QuerySnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import type { MealPlan } from '../../types'

const plansCol = (familyId: string) => collection(db, 'families', familyId, 'mealPlans')

const range = (familyId: string, from: string, to: string) => query(plansCol(familyId), where(documentId(), '>=', from), where(documentId(), '<=', to))

function readPlans(snap: QuerySnapshot): Record<string, MealPlan> {
  const plans: Record<string, MealPlan> = {}
  for (const d of snap.docs) {
    const data = d.data()
    plans[d.id] = {
      breakfast: data.breakfast ?? '',
      lunch: data.lunch ?? '',
      dinner: data.dinner ?? '',
      notes: data.notes ?? '',
      ...(typeof data.people === 'number' ? { people: data.people } : {}),
    }
  }
  return plans
}

/** Plans keyed by YYYY-MM-DD for the inclusive date range. */
export function watchMealPlans(familyId: string, from: string, to: string, onChange: (plans: Record<string, MealPlan>) => void) {
  return onSnapshot(range(familyId, from, to), (snap) => onChange(readPlans(snap)))
}

/** The same, read once (another week to apply a template to; recent meals for the randomizer). */
export async function getMealPlans(familyId: string, from: string, to: string): Promise<Record<string, MealPlan>> {
  return readPlans(await getDocs(range(familyId, from, to)))
}

export const isBlankPlan = (plan: MealPlan) => [plan.breakfast, plan.lunch, plan.dinner, plan.notes].every((v) => !v.trim())
const planFields = ({ people, ...meals }: MealPlan, updatedBy: string) => ({ ...meals, ...(people ? { people } : {}), updatedBy })

/** Saves a day's plan, or deletes the doc when every field is blank. */
export function saveMealPlan(familyId: string, date: string, plan: MealPlan, updatedBy: string) {
  const ref = doc(plansCol(familyId), date)
  return isBlankPlan(plan) ? deleteDoc(ref) : setDoc(ref, planFields(plan, updatedBy))
}

/** Saves several days at once: one write to the device's copy, one update on screen, one trip. */
export function saveMealPlans(familyId: string, plans: Record<string, MealPlan>, updatedBy: string) {
  const batch = writeBatch(db)
  for (const [date, plan] of Object.entries(plans)) {
    const ref = doc(plansCol(familyId), date)
    if (isBlankPlan(plan)) batch.delete(ref)
    else batch.set(ref, planFields(plan, updatedBy))
  }
  return batch.commit()
}
