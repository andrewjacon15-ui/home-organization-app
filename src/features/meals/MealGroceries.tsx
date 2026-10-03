import { CloseIcon } from '../../components/Icons'
import { useState } from 'react'
import { addDays, fromDateKey } from '../../lib/dates'
import { mealKey, SLOT_LABELS, SPANS, type GroceryResult, type PlannedMeal } from './upcomingMeals'

interface Props {
  today: string
  days: number
  onDays: (n: number) => void
  meals: PlannedMeal[] | null
  onAdd: (meals: PlannedMeal[]) => Promise<GroceryResult>
  onClose: () => void
}

const dayLabel = (date: string, today: string) =>
  date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : fromDateKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

/**
 * Groceries for upcoming meals: tick the planned meals to shop for, and their recipes'
 * ingredients go on the grocery list, combined (two recipes' rice becomes one line).
 */
export function MealGroceries({ today, days, onDays, meals, onAdd, onClose }: Props) {
  const withRecipe = (meals ?? []).filter((m) => m.recipeId)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Every meal with a recipe starts ticked; changing the span starts over.
  const chosen = picked ?? new Set(withRecipe.map(mealKey))

  const toggle = (k: string) => {
    const next = new Set(chosen)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setPicked(next)
    setResult(null)
  }

  async function add() {
    setBusy(true)
    setError(null)
    try {
      const r = await onAdd(withRecipe.filter((m) => chosen.has(mealKey(m))))
      const skipped = [r.staples ? `${r.staples} pantry staple${r.staples === 1 ? '' : 's'}` : null, r.onList ? `${r.onList} already on the list` : null].filter(Boolean)
      setResult(`Added ${r.added} item${r.added === 1 ? '' : 's'} to the grocery list.${skipped.length ? ` Skipped ${skipped.join(' and ')}.` : ''}`)
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
        <p className="muted">Pick the meals you’re shopping for. Their ingredients go on the grocery list, added up across recipes; pantry staples and anything already on the list are left off.</p>
        <div className="meal-groceries__span">
          <span id="meal-span">Next</span>
          <div className="segmented segmented--small" role="group" aria-labelledby="meal-span">
            {SPANS.map((n) => (
              <button key={n} type="button" className={`segmented__item${n === days ? ' segmented__item--active' : ''}`} aria-pressed={n === days} onClick={() => {
                  onDays(n)
                  setPicked(null)
                  setResult(null)
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

        <div className="row">
          <button type="button" className="button button--primary" disabled={busy || count === 0} onClick={() => void add()}>
            {busy ? 'Adding…' : `Add ingredients for ${count} meal${count === 1 ? '' : 's'}`}
          </button>
          <button type="button" className="button" onClick={onClose}>
            Done
          </button>
        </div>
        {result && (
          <p className="meal-groceries__result" role="status">
            {result}
          </p>
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
