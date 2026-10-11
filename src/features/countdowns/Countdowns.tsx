import { useState } from 'react'
import { AddIcon, CloseIcon } from '../../components/Icons'
import { fromDateKey } from '../../lib/dates'
import { CountdownForm } from './CountdownForm'
import { daysUntil, shownCountdowns, untilLabel, type Countdown, type CountdownKind, type GoogleSpecial } from './countdownsApi'

interface Props {
  countdowns: Countdown[]
  today: string
  /** US holidays in the next couple of months (Settings → Countdowns). */
  holidays?: boolean
  /** Birthdays from Google Calendar. */
  google?: GoogleSpecial[]
  onAdd: (title: string, date: string, kind: CountdownKind) => void
  onRemove: (c: Countdown) => void
}

/** Home panel: big day counts for trips, birthdays, anniversaries, and holidays. */
export function CountdownPanel({ countdowns, today, holidays = true, google, onAdd, onRemove }: Props) {
  const [adding, setAdding] = useState(false)
  const list = shownCountdowns(countdowns, today, { holidays, google })

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
        <CountdownForm
          today={today}
          onAdd={(title, date, kind) => {
            onAdd(title, date, kind)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {list.length === 0 && !adding ? (
        <p className="muted countdowns__empty">Nothing to count down to yet. Add a trip, a birthday, or an anniversary.</p>
      ) : (
        <ol className="countdowns">
          {list.map((c) => {
            const { count, unit } = untilLabel(daysUntil(c.date, today))
            const day = fromDateKey(c.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
            const when = c.detail ? `${day} · ${c.detail}` : day
            return (
              <li key={c.id} className={`countdown countdown--${c.kind}${c.date === today ? ' countdown--today' : ''}`} aria-label={`${c.title}: ${unit ? `${count} ${unit}` : count}, ${when}`}>
                <span className="countdown__days">
                  <span className="countdown__count">{count}</span>
                  {unit && <span className="countdown__unit">{unit}</span>}
                </span>
                <span className="countdown__text">
                  <span className="countdown__title">{c.title}</span>
                  <span className="countdown__date">{when}</span>
                </span>
                {c.source && (
                  <button
                    type="button"
                    className="icon-button countdown__remove"
                    aria-label={`Remove ${c.title}`}
                    onClick={() => onRemove(c.source!)}
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
