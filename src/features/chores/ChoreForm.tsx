import { useState, type FormEvent } from 'react'
import { Select } from '../../components/Select'
import { fromDateKey } from '../../lib/dates'
import type { Member, NewChore } from '../../types'
import { toRepeat, type RepeatChoice } from './schedule'


const DAY_LETTERS = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, label: new Date(2026, 0, 4 + d).toLocaleDateString(undefined, { weekday: 'narrow' }), name: new Date(2026, 0, 4 + d).toLocaleDateString(undefined, { weekday: 'long' }) }))


interface Props {
  members: Member[]
  defaultDate: string
  /** Pre-select a person (or null for Up for Grabs). */
  defaultAssignee?: string | null
  onAdd: (chore: NewChore) => void
  onCancel: () => void
}

export function ChoreForm({ members, defaultDate, defaultAssignee = null, onAdd, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState(defaultAssignee ?? '')
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState('')
  const [points, setPoints] = useState(1)
  const [repeat, setRepeat] = useState<RepeatChoice>('none')
  const [days, setDays] = useState<number[]>([fromDateKey(defaultDate).getDay()])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const r = toRepeat(repeat, days.length ? days : [fromDateKey(date || defaultDate).getDay()])
    onAdd({
      title: title.trim(),
      assigneeId: assignee || null,
      // Repeating chores need a start date; one-offs may be "anytime".
      dueDate: date || (r ? defaultDate : null),
      ...(time && (date || r) ? { dueTime: time } : {}),
      points: Math.max(0, Math.floor(points) || 0),
      ...(r ? { repeat: r } : {}),
    })
    setTitle('')
  }

  return (
    <form className="chore-form2 card" onSubmit={submit} aria-label="New chore">
      <input className="chore-form2__title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" aria-label="Chore" maxLength={200} autoFocus />
      <label className="field">
        Who
        <Select value={assignee} onChange={setAssignee} options={[{ value: '', label: 'Up for grabs' }, ...members.map((m) => ({ value: m.id, label: m.displayName }))]} />
      </label>
      <label className="field">
        {repeat === 'none' ? 'Due' : 'Starts'}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        Time
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <label className="field">
        Stars
        <input type="number" min={0} max={1000} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
      </label>
      <label className="field">
        Repeat
        <Select
          value={repeat}
          onChange={(v) => setRepeat(v as RepeatChoice)}
          options={[
            { value: 'none', label: "Doesn't repeat" },
            { value: 'daily', label: 'Every day' },
            { value: 'weekdays', label: 'Weekdays' },
            { value: 'weekly', label: 'Every week' },
            { value: 'biweekly', label: 'Every 2 weeks' },
            { value: 'monthly', label: 'Every month' },
          ]}
        />
      </label>
      {(repeat === 'weekly' || repeat === 'biweekly') && (
        <div className="field chore-form2__days" role="group" aria-label="On">
          On
          <div className="row">
            {DAY_LETTERS.map(({ d, label, name }) => {
              const on = days.includes(d)
              return (
                <button key={d} type="button" className={`day-toggle${on ? ' day-toggle--on' : ''}`} aria-pressed={on} aria-label={name} onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}>
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div className="row chore-form2__actions">
        <button className="button button--primary" disabled={!title.trim()}>
          Add chore
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Done
        </button>
      </div>
    </form>
  )
}
