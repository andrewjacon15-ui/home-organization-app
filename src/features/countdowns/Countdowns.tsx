import { X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { AddIcon, ICON_STROKE } from '../../components/Icons'
import { fromDateKey } from '../../lib/dates'
import { daysUntil, untilLabel, upcoming, type Countdown } from './countdownsApi'

interface Props {
  countdowns: Countdown[]
  today: string
  onAdd: (title: string, date: string) => void
  onRemove: (c: Countdown) => void
}

/** Home panel: big day counts for what the family is looking forward to. */
export function CountdownPanel({ countdowns, today, onAdd, onRemove }: Props) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const list = upcoming(countdowns, today)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date || date < today) return
    onAdd(title, date)
    setTitle('')
    setDate('')
    setAdding(false)
  }

  return (
    <section className="home-panel home-panel--countdowns" aria-label="Countdowns">
      <header className="home-panel__head">
        <h2>Countdowns</h2>
        {!adding && (
          <button type="button" className="link countdowns__add" onClick={() => setAdding(true)}>
            <AddIcon width={16} height={16} /> Add
          </button>
        )}
      </header>
      {adding && (
        <form className="countdowns__form" onSubmit={submit} aria-label="New countdown">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Beach trip" aria-label="What are you counting down to?" maxLength={80} autoFocus />
          <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} aria-label="Date" required />
          <button className="button button--primary" disabled={!title.trim() || !date || date < today}>
            Add
          </button>
          <button type="button" className="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}
      {list.length === 0 && !adding ? (
        <p className="muted countdowns__empty">Nothing to count down to yet. Add a trip, a birthday, or the last day of school.</p>
      ) : (
        <ol className="countdowns">
          {list.map((c) => {
            const { count, unit } = untilLabel(daysUntil(c.date, today))
            const day = fromDateKey(c.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
            return (
              <li key={c.id} className={`countdown${c.date === today ? ' countdown--today' : ''}`} aria-label={`${c.title}: ${unit ? `${count} ${unit}` : count}, ${day}`}>
                <span className="countdown__count">{count}</span>
                <span className="countdown__text">
                  {unit && <span className="countdown__unit">{unit} until</span>}
                  <span className="countdown__title">{c.title}</span>
                  <span className="countdown__date">{day}</span>
                </span>
                <button
                  type="button"
                  className="icon-button countdown__remove"
                  aria-label={`Remove ${c.title}`}
                  onClick={() => {
                    if (confirm(`Remove the countdown to ${c.title}?`)) onRemove(c)
                  }}
                >
                  <X size={14} strokeWidth={ICON_STROKE} aria-hidden />
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
