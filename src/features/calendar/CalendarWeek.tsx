import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { WeekNav } from '../../components/WeekNav'
import { addDays, fromDateKey } from '../../lib/dates'
import type { CalendarEvent, Member, NewManualEvent } from '../../types'
import { buildManualEvent, groupByDay } from './events'

interface Props {
  weekStart: string
  currentWeekStart: string
  today: string
  events: CalendarEvent[]
  members: Member[]
  onWeekChange: (weekStart: string) => void
  onAdd: (event: NewManualEvent) => void
  onDelete: (event: CalendarEvent) => void
}

const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export function CalendarWeek({ weekStart, currentWeekStart, today, events, members, onWeekChange, onAdd, onDelete }: Props) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const byDay = useMemo(() => groupByDay(events, days), [events, days])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  return (
    <section className="calendar" aria-labelledby="calendar-heading">
      <WeekNav weekStart={weekStart} currentWeekStart={currentWeekStart} onWeekChange={onWeekChange} headingId="calendar-heading" />

      <AddEventForm defaultDate={days.includes(today) ? today : weekStart} onAdd={onAdd} />

      <ol className="week">
        {days.map((date) => {
          const isToday = date === today
          const label = fromDateKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
          return (
            <li key={date} className={`day card${isToday ? ' day--today' : ''}`} aria-current={isToday ? 'date' : undefined} aria-label={label}>
              <div className="day__header">
                <span className="day__weekday">{fromDateKey(date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className="day__date">{fromDateKey(date).getDate()}</span>
                {isToday && <span className="day__today">Today</span>}
              </div>
              {byDay[date].length === 0 ? (
                <p className="day__empty">—</p>
              ) : (
                <ul className="events">
                  {byDay[date].map((e) => {
                    const who = memberById.get(e.sourceUserId)
                    return (
                      <li key={e.id} className={`event${e.allDay ? ' event--allday' : ''}`} style={{ '--pill': who?.color ?? 'var(--muted)' } as CSSProperties}>
                        <div className="event__body">
                          <span className="event__time">{e.allDay ? 'All day' : time(e.start)}</span>
                          <span className="event__title">{e.title}</span>
                          {e.location && <span className="event__location">{e.location}</span>}
                          {who && <span className="visually-hidden">({who.displayName})</span>}
                        </div>
                        {e.source === 'manual' && (
                          <button type="button" className="icon-button event__delete" onClick={() => onDelete(e)} aria-label={`Delete "${e.title}"`}>
                            ✕
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ol>

      {members.length > 1 && (
        <ul className="legend" aria-label="Whose calendar">
          {members.map((m) => (
            <li key={m.id} style={{ '--pill': m.color } as CSSProperties}>
              <span className="chip__dot" aria-hidden /> {m.displayName.split(' ')[0]}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AddEventForm({ defaultDate, onAdd }: { defaultDate: string; onAdd: (e: NewManualEvent) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [allDay, setAllDay] = useState(false)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) return
    onAdd(buildManualEvent({ title, date, allDay, startTime, endTime }))
    setTitle('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        className="button add-event-toggle"
        onClick={() => {
          setDate(defaultDate)
          setOpen(true)
        }}
      >
        + Add event
      </button>
    )
  }

  return (
    <form className="card event-form" onSubmit={submit} aria-label="New event">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's happening?" aria-label="Event title" maxLength={200} autoFocus />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" required />
      <label className="event-form__allday">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
      </label>
      {!allDay && (
        <>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="Starts" />
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="Ends" />
        </>
      )}
      <div className="row">
        <button type="submit" className="button button--primary" disabled={!title.trim()}>
          Save
        </button>
        <button type="button" className="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
