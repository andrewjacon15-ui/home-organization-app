import { useState } from 'react'
import { WeekNav } from '../../components/WeekNav'
import { addDays, fromDateKey } from '../../lib/dates'
import type { MealPlan, MealSlot } from '../../types'

const EMPTY_PLAN: MealPlan = { breakfast: '', lunch: '', dinner: '', notes: '' }

const SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: 'breakfast', label: 'Breakfast' },
  { slot: 'lunch', label: 'Lunch' },
  { slot: 'dinner', label: 'Dinner' },
  { slot: 'notes', label: 'Notes' },
]

interface Props {
  /** YYYY-MM-DD of the first day shown. */
  weekStart: string
  today: string
  plans: Record<string, MealPlan>
  onSave: (date: string, plan: MealPlan) => void
  onWeekChange: (weekStart: string) => void
  /** Where "This week" jumps to. */
  currentWeekStart: string
  /** Recipe titles to suggest while typing a meal. */
  recipeTitles?: string[]
  /** When a meal names a saved recipe, this opens it. */
  onOpenRecipe?: (mealText: string) => void
  hasRecipe?: (mealText: string) => boolean
}

export function MealPlanner({ weekStart, today, plans, onSave, onWeekChange, currentWeekStart, recipeTitles = [], onOpenRecipe, hasRecipe }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <section className="meals" aria-labelledby="meals-heading">
      <WeekNav weekStart={weekStart} currentWeekStart={currentWeekStart} onWeekChange={onWeekChange} headingId="meals-heading" />

      {recipeTitles.length > 0 && (
        <datalist id="recipe-titles">
          {recipeTitles.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}

      <ol className="week">
        {days.map((date) => {
          const plan = plans[date] ?? EMPTY_PLAN
          const isToday = date === today
          return (
            <li key={date} className={`day card${isToday ? ' day--today' : ''}${date < today ? ' day--past' : ''}`} aria-current={isToday ? 'date' : undefined} aria-label={fmt(date, { weekday: 'long', month: 'long', day: 'numeric' })}>
              <div className="day__header">
                <span className="day__weekday">{fmt(date, { weekday: 'short' })}</span>
                <span className="day__date">{fromDateKey(date).getDate()}</span>
                {isToday && <span className="day__today">Today</span>}
              </div>
              {SLOTS.map(({ slot, label }) => (
                <MealField
                  key={slot}
                  label={label}
                  dayLabel={fmt(date, { weekday: 'long' })}
                  value={plan[slot]}
                  multiline={slot === 'notes'}
                  suggest={slot !== 'notes' && recipeTitles.length > 0}
                  onOpenRecipe={slot !== 'notes' && onOpenRecipe && hasRecipe?.(plan[slot]) ? () => onOpenRecipe(plan[slot]) : undefined}
                  onCommit={(value) => onSave(date, { ...plan, [slot]: value })}
                />
              ))}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function fmt(key: string, options: Intl.DateTimeFormatOptions) {
  return fromDateKey(key).toLocaleDateString(undefined, options)
}

interface FieldProps {
  label: string
  dayLabel: string
  value: string
  multiline: boolean
  suggest?: boolean
  onOpenRecipe?: () => void
  onCommit: (value: string) => void
}

/** Edits locally and commits on blur (or Enter), so typing doesn't write to Firestore on every keystroke. */
function MealField({ label, dayLabel, value, multiline, suggest, onOpenRecipe, onCommit }: FieldProps) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)

  // Take remote updates (another device edited this day) unless we're mid-edit.
  const [seenValue, setSeenValue] = useState(value)
  if (value !== seenValue && !editing) {
    setSeenValue(value)
    setDraft(value)
  }

  function commit() {
    setEditing(false)
    const next = draft.trim()
    if (next !== value) onCommit(next)
    setDraft(next)
  }

  const common = {
    value: draft,
    'aria-label': `${dayLabel} ${label.toLowerCase()}`,
    onFocus: () => setEditing(true),
    onBlur: commit,
    maxLength: multiline ? 2000 : 500,
  }

  return (
    <div className="meal">
      <span className="meal__label">
        {label}
        {onOpenRecipe && !editing && (
          <button type="button" className="meal__recipe" onClick={onOpenRecipe} aria-label={`Open recipe for ${dayLabel} ${label.toLowerCase()}`}>
            Recipe →
          </button>
        )}
      </span>
      {multiline ? (
        <textarea {...common} rows={2} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <input
          {...common}
          list={suggest ? 'recipe-titles' : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      )}
    </div>
  )
}
