import { useState, type FormEvent } from 'react'
import type { CountdownKind } from './countdownsApi'

const KINDS: { kind: CountdownKind; label: string; name: string; placeholder: string; date: string }[] = [
  { kind: 'once', label: 'One time', name: 'What are you counting down to?', placeholder: 'Beach trip', date: 'Date' },
  { kind: 'birthday', label: 'Birthday', name: 'Whose birthday?', placeholder: 'Mom', date: 'Birthday (the year shows their age)' },
  { kind: 'anniversary', label: 'Anniversary', name: 'Whose anniversary?', placeholder: 'Mom & Dad', date: 'Wedding date' },
]

interface Props {
  today: string
  onAdd: (title: string, date: string, kind: CountdownKind) => void
  /** Without it there's no Cancel (Settings keeps the form open). */
  onCancel?: () => void
  autoFocus?: boolean
}

/** A trip, a birthday, or an anniversary: what it is and when. Used on Home and in Settings. */
export function CountdownForm({ today, onAdd, onCancel, autoFocus = true }: Props) {
  const [kind, setKind] = useState<CountdownKind>('once')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
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
  }

  return (
    <form className="countdowns__form" onSubmit={submit} aria-label="New countdown">
      <div className="segmented segmented--small countdowns__kind" role="group" aria-label="Kind of countdown">
        {KINDS.map((x) => (
          <button key={x.kind} type="button" className={`segmented__item${x.kind === kind ? ' segmented__item--active' : ''}`} aria-pressed={x.kind === kind} onClick={() => setKind(x.kind)}>
            {x.label}
          </button>
        ))}
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={k.placeholder} aria-label={k.name} maxLength={80} autoFocus={autoFocus} />
      <input type="date" value={date} min={kind === 'once' ? today : undefined} onChange={(e) => setDate(e.target.value)} aria-label={k.date} title={k.date} required />
      <button className="button button--primary" disabled={!ok}>
        Add
      </button>
      {onCancel && (
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      )}
      {kind !== 'once' && <p className="settings-note countdowns__hint">Repeats every year. The year you enter shows their age or which anniversary it is.</p>}
    </form>
  )
}
