import { useEffect, useState } from 'react'
import { addDays, daysBetween, startOfWeek } from '../../lib/dates'
import { useToday } from '../../lib/hooks'
import { useSettings } from '../settings/SettingsContext'
import type { MealPlan } from '../../types'
import { MealPlanner } from './MealPlanner'
import { saveMealPlan, watchMealPlans } from './mealsApi'

interface Props {
  familyId: string
  userId: string
}

export function MealsPage({ familyId, userId }: Props) {
  const today = useToday()
  const { settings } = useSettings()
  const currentWeekStart = startOfWeek(today, settings.weekStartsOn)
  // An offset (not a fixed date) so the wall display rolls to the new week on its own.
  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = addDays(currentWeekStart, weekOffset * 7)
  const [plans, setPlans] = useState<Record<string, MealPlan>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => watchMealPlans(familyId, weekStart, addDays(weekStart, 6), setPlans), [familyId, weekStart])

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <MealPlanner
        weekStart={weekStart}
        currentWeekStart={currentWeekStart}
        today={today}
        plans={plans}
        onWeekChange={(start) => setWeekOffset(Math.round(daysBetween(currentWeekStart, start) / 7))}
        onSave={(date, plan) =>
          saveMealPlan(familyId, date, plan, userId).catch((e) => setError(e instanceof Error ? e.message : String(e)))
        }
      />
    </>
  )
}
