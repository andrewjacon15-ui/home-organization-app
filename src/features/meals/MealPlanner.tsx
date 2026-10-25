import { useId, useRef, useState } from 'react'
import { AutoText } from '../../components/AutoText'
import { BookIcon, CartIcon, CloseIcon, RandomIcon } from '../../components/Icons'
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
  /** Checks the grocery list against the week's meals: adds what's missing, takes off what's not needed. */
  onSyncGroceries?: () => void
}

export function MealPlanner({ weekStart, today, plans, onSave, onWeekChange, currentWeekStart, recipeTitles = [], onOpenRecipe, hasRecipe, onRandomize, onClearMeal, onClearDay, onClearWeek, onSyncGroceries }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const planned = (d: string) => !!plans[d] && SLOTS.some(({ slot }) => plans[d][slot].trim())
  const weekPlanned = days.some(planned)

  return (
    <section className="meals" aria-labelledby="meals-heading">
      <div className="meals__nav">
        <WeekNav weekStart={weekStart} currentWeekStart={currentWeekStart} onWeekChange={onWeekChange} headingId="meals-heading" />
        {onSyncGroceries && weekPlanned && (
          <button type="button" className="link meals__sync" onClick={onSyncGroceries} title="Add groceries for meals that are missing them, and take off ones no meal needs">
            <CartIcon size={16} aria-hidden /> Sync groceries
          </button>
        )}
        {onClearWeek && weekPlanned && (
          <button type="button" className="link meals__clear-week" onClick={onClearWeek}>
            Clear this week
          </button>
        )}
      </div>

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
                  suggestions={slot !== 'notes' ? recipeTitles : undefined}
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
  /** Recipe titles to offer while typing. */
  suggestions?: string[]
  onOpenRecipe?: () => void
  onRandomize?: () => void
  onClear?: () => void
  onCommit: (value: string) => void
}

const MAX_SUGGESTIONS = 6

/**
 * Edits locally and commits on blur (or Enter), so typing doesn't write to Firestore on every
 * keystroke. The box grows to show the whole meal or note; while typing a meal, recipe titles
 * that match are offered underneath.
 */
function MealField({ label, dayLabel, value, multiline, suggestions = [], onOpenRecipe, onRandomize, onClear, onCommit }: FieldProps) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()

  // Take remote updates (another device edited this day) unless we're mid-edit.
  const [seenValue, setSeenValue] = useState(value)
  if (value !== seenValue && !editing) {
    setSeenValue(value)
    setDraft(value)
  }

  // Set when a suggestion was just picked, so the blur that follows doesn't commit the half-typed text.
  const picked = useRef(false)

  function commit(text = draft) {
    setEditing(false)
    setActive(-1)
    const next = text.trim()
    if (next !== value) onCommit(next)
    setDraft(next)
  }

  /** Puts a suggested recipe in, saves it, and leaves the box. */
  function pick(title: string, el: HTMLElement | null) {
    picked.current = true
    commit(title)
    el?.blur()
    picked.current = false
  }

  const typed = draft.trim().toLowerCase()
  const matches = editing && typed ? suggestions.filter((t) => t.toLowerCase().includes(typed) && t.toLowerCase() !== typed).slice(0, MAX_SUGGESTIONS) : []

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
      <AutoText
        value={draft}
        aria-label={`${dayLabel} ${label.toLowerCase()}`}
        maxLength={multiline ? 2000 : 500}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          if (!picked.current) commit()
        }}
        onChange={(e) => {
          // A meal is one line (a pasted line break becomes a space); a note can have several.
          setDraft(multiline ? e.target.value : e.target.value.replace(/\r?\n/g, ' '))
          setActive(-1)
        }}
        role={matches.length ? 'combobox' : undefined}
        aria-expanded={matches.length ? true : undefined}
        aria-controls={matches.length ? listId : undefined}
        aria-autocomplete={suggestions.length ? 'list' : undefined}
        aria-activedescendant={active >= 0 && matches[active] ? `${listId}-${active}` : undefined}
        onKeyDown={(e) => {
          if (multiline) return
          if (matches.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % matches.length : (i <= 0 ? matches.length : i) - 1))
          } else if (e.key === 'Escape' && matches.length) {
            setActive(-1)
            setDraft(value)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            // Blur commits what's typed; a highlighted suggestion goes in instead.
            if (active >= 0 && matches[active]) pick(matches[active], e.currentTarget)
            else e.currentTarget.blur()
          }
        }}
      />
      {matches.length > 0 && (
        <ul className="meal__suggest" id={listId} role="listbox" aria-label={`Recipes for ${dayLabel} ${label.toLowerCase()}`}>
          {matches.map((t, i) => (
            <li
              key={t}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`meal__suggestion${i === active ? ' meal__suggestion--active' : ''}`}
              // On press, before the box loses focus (a tap would blur it first).
              onMouseDown={(e) => {
                e.preventDefault()
                pick(t, document.activeElement as HTMLElement | null)
              }}
            >
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
