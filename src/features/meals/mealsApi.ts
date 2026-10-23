import { collection, deleteDoc, doc, documentId, getDocs, onSnapshot, query, setDoc, where, type QuerySnapshot } from 'firebase/firestore'
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

/** Saves a day's plan, or deletes the doc when every field is blank. */
export function saveMealPlan(familyId: string, date: string, plan: MealPlan, updatedBy: string) {
  const ref = doc(plansCol(familyId), date)
  const isEmpty = Object.values(plan).every((v) => v.trim() === '')
  return isEmpty ? deleteDoc(ref) : setDoc(ref, { ...plan, updatedBy })
}
