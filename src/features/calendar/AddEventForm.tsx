import { useState, type CSSProperties, type FormEvent } from 'react'
import type { Member, NewManualEvent } from '../../types'
import { buildManualEvent } from './events'
import { AddIcon } from '../../components/Icons'

interface Props {
  defaultDate: string
  members: Member[]
  userId: string
  /** countdown: also count down to it on Home. */
  onAdd: (event: NewManualEvent, options: { countdown: boolean }) => void
}

export function AddEventForm({ defaultDate, members, userId, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [allDay, setAllDay] = useState(false)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [who, setWho] = useState<string[]>([userId])
  const [countdown, setCountdown] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) return
    onAdd({ ...buildManualEvent({ title, date, allDay, startTime, endTime }), memberIds: who.length ? who : [userId] }, { countdown })
    setTitle('')
    setCountdown(false)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        className="button add-event-toggle"
        onClick={() => {
          setDate(defaultDate)
          setWho([userId])
          setOpen(true)
        }}
      >
        <AddIcon />
        Add event
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
      <label className="event-form__allday">
        <input type="checkbox" checked={countdown} onChange={(e) => setCountdown(e.target.checked)} /> Count down on Home
      </label>
      {members.length > 1 && (
        <div className="event-form__who" role="group" aria-label="For">
          <span className="muted">For</span>
          {members.map((m) => {
            const on = who.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                className={`chip${on ? ' chip--active' : ''}`}
                style={{ '--pill': m.color } as CSSProperties}
                aria-pressed={on}
                onClick={() => setWho(on ? who.filter((id) => id !== m.id) : [...who, m.id])}
              >
                <span className="chip__dot" aria-hidden />
                {m.displayName.split(' ')[0]}
              </button>
            )
          })}
        </div>
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
