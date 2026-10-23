import type { GroceryPlan } from '@shared/recipes/groceries.js'
import { CloseIcon } from '../../components/Icons'
import { Select } from '../../components/Select'
import { useState } from 'react'
import { addDays, fromDateKey } from '../../lib/dates'
import { GroceryReview } from './GroceryReview'
import { PEOPLE_OPTIONS, peopleValue, readPeopleValue } from './people'
import { mealKey, SLOT_LABELS, SPANS, type PlannedMeal } from './upcomingMeals'

interface Props {
  today: string
  days: number
  onDays: (n: number) => void
  meals: PlannedMeal[] | null
  /** How many the household usually cooks for (Settings → Kitchen). */
  defaultPeople: number | null
  /** The combined grocery list for these meals, scaled to `people`, to look over. */
  onReview: (meals: PlannedMeal[], people: number | null) => Promise<GroceryPlan>
  onAdd: (lines: string[]) => Promise<void>
  onClose: () => void
}

const dayLabel = (date: string, today: string) =>
  date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : fromDateKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

/**
 * Groceries for upcoming meals: tick the planned meals to shop for, and their recipes'
 * ingredients go on the grocery list, combined (two recipes' rice becomes one line).
 */
export function MealGroceries({ today, days, onDays, meals, defaultPeople, onReview, onAdd, onClose }: Props) {
  const withRecipe = (meals ?? []).filter((m) => m.recipeId)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [people, setPeople] = useState(defaultPeople)
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState<GroceryPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Every meal with a recipe starts ticked; changing the span starts over.
  const chosen = picked ?? new Set(withRecipe.map(mealKey))

  const toggle = (k: string) => {
    const next = new Set(chosen)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setPicked(next)
  }

  async function next() {
    setBusy(true)
    setError(null)
    try {
      setReview(await onReview(withRecipe.filter((m) => chosen.has(mealKey(m))), people))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const count = withRecipe.filter((m) => chosen.has(mealKey(m))).length
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Groceries for upcoming meals" onClick={onClose}>
      <div className="overlay__panel meal-groceries" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-button overlay__close" onClick={onClose} aria-label="Close">
          <CloseIcon size={22} />
        </button>
        <h2>Groceries for upcoming meals</h2>
        {review ? (
          <GroceryReview plan={review} people={people} onAdd={onAdd} onDone={onClose} />
        ) : (
          <>
        <p className="muted">Pick the meals you’re shopping for. Their ingredients are added up across recipes; pantry staples and anything already on the list are left off. You’ll see the list before anything is added.</p>
        <div className="meal-groceries__span">
          <span id="meal-span">Next</span>
          <div className="segmented segmented--small" role="group" aria-labelledby="meal-span">
            {SPANS.map((n) => (
              <button key={n} type="button" className={`segmented__item${n === days ? ' segmented__item--active' : ''}`} aria-pressed={n === days} onClick={() => {
                  onDays(n)
                  setPicked(null)
                }}>
                {n} days
              </button>
            ))}
          </div>
        </div>

        {meals === null ? (
          <p className="muted" role="status">
            Loading the meal plan…
          </p>
        ) : meals.length === 0 ? (
          <p className="empty">Nothing planned in the next {days} days. Plan meals here, or from any recipe with “Add to meal plan”.</p>
        ) : (
          <ul className="meal-groceries__list" aria-label="Planned meals">
            {meals.map((m) => {
              const k = mealKey(m)
              return (
                <li key={k}>
                  <label className={`meal-groceries__meal${m.recipeId ? '' : ' meal-groceries__meal--off'}`}>
                    <input type="checkbox" checked={!!m.recipeId && chosen.has(k)} disabled={!m.recipeId} onChange={() => toggle(k)} />
                    <span>
                      <strong>{m.text}</strong>
                      <span className="muted">
                        {' '}
                        · {dayLabel(m.date, today)}, {SLOT_LABELS[m.slot].toLowerCase()}
                        {m.recipeId ? '' : ' · no saved recipe'}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        <label className="field meal-templates__people">
          Cooking for
          <Select value={peopleValue(people)} options={PEOPLE_OPTIONS} onChange={(v) => setPeople(readPeopleValue(v))} aria-label="Cooking for" />
        </label>
        <div className="row">
          <button type="button" className="button button--primary" disabled={busy || count === 0} onClick={() => void next()}>
            {busy ? 'Adding up…' : `See the groceries for ${count} meal${count === 1 ? '' : 's'}`}
          </button>
          <button type="button" className="button" onClick={onClose}>
            Done
          </button>
        </div>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
