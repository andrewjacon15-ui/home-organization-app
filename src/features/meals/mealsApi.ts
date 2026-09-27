import { collection, deleteDoc, doc, documentId, onSnapshot, query, setDoc, where } from 'firebase/firestore'
import { db } from '../../firebase'
import type { MealPlan } from '../../types'

const plansCol = (familyId: string) => collection(db, 'families', familyId, 'mealPlans')

/** Plans keyed by YYYY-MM-DD for the inclusive date range. */
export function watchMealPlans(familyId: string, from: string, to: string, onChange: (plans: Record<string, MealPlan>) => void) {
  const q = query(plansCol(familyId), where(documentId(), '>=', from), where(documentId(), '<=', to))
  return onSnapshot(q, (snap) => {
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
    onChange(plans)
  })
}

/** Saves a day's plan, or deletes the doc when every field is blank. */
export function saveMealPlan(familyId: string, date: string, plan: MealPlan, updatedBy: string) {
  const ref = doc(plansCol(familyId), date)
  const isEmpty = Object.values(plan).every((v) => v.trim() === '')
  return isEmpty ? deleteDoc(ref) : setDoc(ref, { ...plan, updatedBy })
}
