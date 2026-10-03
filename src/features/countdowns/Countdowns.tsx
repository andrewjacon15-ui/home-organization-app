import { useState, type FormEvent } from 'react'
import { AddIcon, CloseIcon } from '../../components/Icons'
import { fromDateKey } from '../../lib/dates'
import { daysUntil, shownCountdowns, untilLabel, type Countdown, type CountdownKind } from './countdownsApi'

interface Props {
  countdowns: Countdown[]
  today: string
  /** US holidays in the next couple of months (Settings → Home screen). */
  holidays?: boolean
  onAdd: (title: string, date: string, kind: CountdownKind) => void
  onRemove: (c: Countdown) => void
}

const KINDS: { kind: CountdownKind; label: string; name: string; placeholder: string; date: string }[] = [
  { kind: 'once', label: 'One time', name: 'What are you counting down to?', placeholder: 'Beach trip', date: 'Date' },
  { kind: 'birthday', label: 'Birthday', name: 'Whose birthday?', placeholder: 'Mom', date: 'Birthday (the year shows their age)' },
  { kind: 'anniversary', label: 'Anniversary', name: 'Whose anniversary?', placeholder: 'Mom & Dad', date: 'Wedding date' },
]

/** Home panel: big day counts for trips, birthdays, anniversaries, and holidays. */
export function CountdownPanel({ countdowns, today, holidays = true, onAdd, onRemove }: Props) {
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<CountdownKind>('once')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const list = shownCountdowns(countdowns, today, { holidays })
  const k = KINDS.find((x) => x.kind === kind)!
  // A one-time countdown has to be ahead; a birthday or anniversary is usually in the past.
  const ok = !!title.trim() && !!date && (kind !== 'once' || date >= today)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!ok) return
    onAdd(title, date, kind)
    setTitle('')
    setDate('')
    setKind('once')
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
          <div className="segmented segmented--small countdowns__kind" role="group" aria-label="Kind of countdown">
            {KINDS.map((x) => (
              <button key={x.kind} type="button" className={`segmented__item${x.kind === kind ? ' segmented__item--active' : ''}`} aria-pressed={x.kind === kind} onClick={() => setKind(x.kind)}>
                {x.label}
              </button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={k.placeholder} aria-label={k.name} maxLength={80} autoFocus />
          <input type="date" value={date} min={kind === 'once' ? today : undefined} onChange={(e) => setDate(e.target.value)} aria-label={k.date} title={k.date} required />
          <button className="button button--primary" disabled={!ok}>
            Add
          </button>
          <button type="button" className="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
          {kind !== 'once' && <p className="settings-note countdowns__hint">Repeats every year. The year you enter shows their age or which anniversary it is.</p>}
        </form>
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
                    onClick={() => {
                      const yearly = c.kind === 'birthday' || c.kind === 'anniversary'
                      if (confirm(yearly ? `Remove ${c.title}? It won’t come back next year.` : `Remove the countdown to ${c.title}?`)) onRemove(c.source!)
                    }}
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
