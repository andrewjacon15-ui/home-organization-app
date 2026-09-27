import { useState } from 'react'
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
}

export function MealPlanner({ weekStart, today, plans, onSave, onWeekChange, currentWeekStart }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const rangeLabel = `${fmt(days[0], { month: 'short', day: 'numeric' })} – ${fmt(days[6], { month: 'short', day: 'numeric' })}`

  return (
    <section className="meals" aria-labelledby="meals-heading">
      <div className="week-nav">
        <button type="button" className="button" onClick={() => onWeekChange(addDays(weekStart, -7))} aria-label="Previous week">
          ‹
        </button>
        <h2 id="meals-heading" className="week-nav__label">
          {rangeLabel}
        </h2>
        <button type="button" className="button" onClick={() => onWeekChange(addDays(weekStart, 7))} aria-label="Next week">
          ›
        </button>
        {weekStart !== currentWeekStart && (
          <button type="button" className="link" onClick={() => onWeekChange(currentWeekStart)}>
            This week
          </button>
        )}
      </div>

      <ol className="week">
        {days.map((date) => {
          const plan = plans[date] ?? EMPTY_PLAN
          const isToday = date === today
          return (
            <li key={date} className={`day card${isToday ? ' day--today' : ''}`} aria-current={isToday ? 'date' : undefined} aria-label={fmt(date, { weekday: 'long', month: 'long', day: 'numeric' })}>
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
  onCommit: (value: string) => void
}

/** Edits locally and commits on blur (or Enter), so typing doesn't write to Firestore on every keystroke. */
function MealField({ label, dayLabel, value, multiline, onCommit }: FieldProps) {
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
    <label className="meal">
      <span className="meal__label">{label}</span>
      {multiline ? (
        <textarea {...common} rows={2} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <input
          {...common}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      )}
    </label>
  )
}
