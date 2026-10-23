import { useState } from 'react'
import { BookIcon, CloseIcon, RandomIcon } from '../../components/Icons'
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
  /** Picks a recipe for this meal at random (from the recipe book). */
  onRandomize?: (date: string, slot: 'breakfast' | 'lunch' | 'dinner') => void
  /** Clears one meal, a whole day, or the whole week (and what was bought for them, with Undo). */
  onClearMeal?: (date: string, slot: MealSlot) => void
  onClearDay?: (date: string) => void
  onClearWeek?: () => void
}

export function MealPlanner({ weekStart, today, plans, onSave, onWeekChange, currentWeekStart, recipeTitles = [], onOpenRecipe, hasRecipe, onRandomize, onClearMeal, onClearDay, onClearWeek }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const planned = (d: string) => !!plans[d] && SLOTS.some(({ slot }) => plans[d][slot].trim())
  const weekPlanned = days.some(planned)

  return (
    <section className="meals" aria-labelledby="meals-heading">
      <div className="meals__nav">
        <WeekNav weekStart={weekStart} currentWeekStart={currentWeekStart} onWeekChange={onWeekChange} headingId="meals-heading" />
        {onClearWeek && weekPlanned && (
          <button type="button" className="link meals__clear-week" onClick={onClearWeek}>
            Clear this week
          </button>
        )}
      </div>

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
                {onClearDay && planned(date) && (
                  <button type="button" className="link day__clear" onClick={() => onClearDay(date)} aria-label={`Clear ${fmt(date, { weekday: 'long' })}`}>
                    Clear
                  </button>
                )}
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
                  onRandomize={slot !== 'notes' && onRandomize && date >= today ? () => onRandomize(date, slot) : undefined}
                  onClear={slot !== 'notes' && onClearMeal && plan[slot].trim() ? () => onClearMeal(date, slot) : undefined}
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
  onRandomize?: () => void
  onClear?: () => void
  onCommit: (value: string) => void
}

/** Edits locally and commits on blur (or Enter), so typing doesn't write to Firestore on every keystroke. */
function MealField({ label, dayLabel, value, multiline, suggest, onOpenRecipe, onRandomize, onClear, onCommit }: FieldProps) {
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
        <span className="meal__name">{label}</span>
        {!editing && (onOpenRecipe || onRandomize || onClear) && (
          // Small icon buttons, so they fit a day column on the wall tablet.
          <span className="meal__actions">
            {onOpenRecipe && (
              <button type="button" className="meal__action meal__action--recipe" onClick={onOpenRecipe} aria-label={`Open recipe for ${dayLabel} ${label.toLowerCase()}`} title="Open the recipe">
                <BookIcon width={15} height={15} aria-hidden />
              </button>
            )}
            {onRandomize && (
              <button type="button" className="meal__action" onClick={onRandomize} aria-label={`Pick ${dayLabel} ${label.toLowerCase()} at random`} title="Pick a recipe at random">
                <RandomIcon width={15} height={15} aria-hidden />
              </button>
            )}
            {onClear && (
              <button type="button" className="meal__action" onClick={onClear} aria-label={`Clear ${dayLabel} ${label.toLowerCase()}`} title="Clear this meal">
                <CloseIcon width={15} height={15} aria-hidden />
              </button>
            )}
          </span>
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
