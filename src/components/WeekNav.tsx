import { addDays, fromDateKey } from '../lib/dates'

interface Props {
  weekStart: string
  currentWeekStart: string
  onWeekChange: (weekStart: string) => void
  headingId?: string
}

const short = (key: string) => fromDateKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function WeekNav({ weekStart, currentWeekStart, onWeekChange, headingId }: Props) {
  return (
    <div className="week-nav">
      <button type="button" className="button" onClick={() => onWeekChange(addDays(weekStart, -7))} aria-label="Previous week">
        ‹
      </button>
      <h2 id={headingId} className="week-nav__label">
        {short(weekStart)} – {short(addDays(weekStart, 6))}
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
  )
}

