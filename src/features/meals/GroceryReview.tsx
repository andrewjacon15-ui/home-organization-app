import { useState } from 'react'
import type { GroceryPlan } from '@shared/recipes/groceries.js'
import { groceryMessage } from './upcomingMeals'

interface Props {
  plan: GroceryPlan
  /** Scaled for this many (null = as each recipe is written). */
  people: number | null
  /** Adds the ticked lines to the grocery list. */
  onAdd: (lines: string[]) => Promise<void>
  onDone: () => void
}

/**
 * The combined grocery list for some meals, before anything is added: every line ticked, with
 * the meals it's for; untick what you already have, then add the rest in one go.
 */
export function GroceryReview({ plan, people, onAdd, onDone }: Props) {
  const [off, setOff] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const chosen = plan.details.filter((_, i) => !off.has(i))
  const skipped = [plan.staples.length && `${plan.staples.length} pantry staple${plan.staples.length === 1 ? '' : 's'}`, plan.onList.length && `${plan.onList.length} already on the list`].filter(Boolean)

  async function add() {
    setBusy(true)
    setError(null)
    try {
      await onAdd(chosen.map((d) => d.line))
      setResult(groceryMessage({ added: chosen.length, staples: plan.staples.length, onList: plan.onList.length }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (result)
    return (
      <div className="grocery-review">
        <p className="meal-groceries__result" role="status">
          {result}
        </p>
        <button type="button" className="button button--primary" onClick={onDone}>
          Done
        </button>
      </div>
    )

  return (
    <div className="grocery-review">
      <h3>Grocery list for these meals</h3>
      <p className="settings-note">
        {people ? `Amounts are for ${people} ${people === 1 ? 'person' : 'people'}. ` : ''}The same ingredient is added up across meals.
        {skipped.length ? ` Left off: ${skipped.join(' and ')}.` : ''} Untick anything you already have.
      </p>
      {plan.details.length === 0 ? (
        <p className="empty">Nothing new to buy for these meals.</p>
      ) : (
        <ul className="grocery-review__list" aria-label="Groceries to add">
          {plan.details.map((d, i) => (
            <li key={`${d.line}-${i}`}>
              <label className="grocery-review__item">
                <input
                  type="checkbox"
                  checked={!off.has(i)}
                  onChange={() =>
                    setOff((cur) => {
                      const next = new Set(cur)
                      if (next.has(i)) next.delete(i)
                      else next.add(i)
                      return next
                    })
                  }
                />
                <span>
                  <span className="grocery-review__line">{d.line}</span>
                  {d.sources.length > 0 && <span className="grocery-review__for">{d.sources.join(' · ')}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="button" className="button button--primary" disabled={busy || chosen.length === 0} onClick={() => void add()}>
          {busy ? 'Adding…' : `Add ${chosen.length} to the grocery list`}
        </button>
        <button type="button" className="button" onClick={onDone}>
          {plan.details.length ? 'Skip' : 'Done'}
        </button>
      </div>
    </div>
  )
}
