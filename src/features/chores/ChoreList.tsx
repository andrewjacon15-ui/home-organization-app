import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { relativeDayLabel } from '../../lib/dates'
import type { Chore, Member, NewChore } from '../../types'

/** "07:30" → "7:30 AM" in the device's locale. */
const formatTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

interface Props {
  chores: Chore[]
  members: Member[]
  /** YYYY-MM-DD for "today" in the device timezone. */
  today: string
  onAdd: (chore: NewChore) => void
  onToggle: (chore: Chore) => void
  onDelete: (chore: Chore) => void
  /** Star balances from the ledger. Without it, stars are counted from completed chores. */
  stars?: Map<string, number>
}

const ANYONE = ''

function sortOpen(a: Chore, b: Chore) {
  // Dated chores first, soonest first; undated ("whenever") last; then by title.
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1
    if (b.dueDate === null) return -1
    return a.dueDate < b.dueDate ? -1 : 1
  }
  if ((a.dueTime ?? '') !== (b.dueTime ?? '')) {
    if (!a.dueTime) return 1
    if (!b.dueTime) return -1
    return a.dueTime < b.dueTime ? -1 : 1
  }
  return a.title.localeCompare(b.title)
}

export function ChoreList({ chores, members, today, onAdd, onToggle, onDelete, stars }: Props) {
  const [filter, setFilter] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState(ANYONE)
  const [dueDate, setDueDate] = useState(today)
  const [dueTime, setDueTime] = useState('')
  const [points, setPoints] = useState(1)

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  const visible = filter === null ? chores : chores.filter((c) => c.assigneeId === filter)
  const open = visible.filter((c) => !c.done).sort(sortOpen)
  const done = visible.filter((c) => c.done).sort((a, b) => a.title.localeCompare(b.title))

  const pointsByMember = useMemo(() => {
    if (stars) return stars
    const totals = new Map<string, number>()
    for (const c of chores) {
      if (c.done && c.assigneeId) totals.set(c.assigneeId, (totals.get(c.assigneeId) ?? 0) + c.points)
    }
    return totals
  }, [chores, stars])

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onAdd({
      title: trimmed,
      assigneeId: assigneeId === ANYONE ? null : assigneeId,
      dueDate: dueDate || null,
      ...(dueDate && dueTime ? { dueTime } : {}),
      points: Math.max(0, Math.floor(points) || 0),
    })
    setTitle('')
  }

  function renderChore(chore: Chore) {
    const assignee = chore.assigneeId ? memberById.get(chore.assigneeId) : undefined
    const overdue = !chore.done && chore.dueDate !== null && chore.dueDate < today
    return (
      <li key={chore.id} className={`chore${chore.done ? ' chore--done' : ''}`}>
        <label className="chore__check">
          <input
            type="checkbox"
            checked={chore.done}
            onChange={() => onToggle(chore)}
            aria-label={`Mark "${chore.title}" ${chore.done ? 'not done' : 'done'}`}
          />
          <span className="chore__title">{chore.title}</span>
        </label>
        <div className="chore__meta">
          {assignee && (
            <span className="pill" style={{ '--pill': assignee.color } as CSSProperties}>
              {assignee.displayName.split(' ')[0]}
            </span>
          )}
          {chore.dueDate && (
            <span className={overdue ? 'chore__due chore__due--overdue' : 'chore__due'}>
              {overdue ? 'Overdue · ' : ''}
              {relativeDayLabel(chore.dueDate, today)}
              {chore.dueTime && ` · ${formatTime(chore.dueTime)}`}
            </span>
          )}
          {chore.points > 0 && <span className="chore__points">★ {chore.points}</span>}
          <button type="button" className="icon-button" onClick={() => onDelete(chore)} aria-label={`Delete "${chore.title}"`}>
            ✕
          </button>
        </div>
      </li>
    )
  }

  return (
    <section className="chores" aria-labelledby="chores-heading">
      <h2 id="chores-heading" className="visually-hidden">
        Chores
      </h2>

      <div className="scoreboard" role="group" aria-label="Filter by person">
        <button type="button" className={`chip${filter === null ? ' chip--active' : ''}`} onClick={() => setFilter(null)} aria-pressed={filter === null}>
          Everyone
        </button>
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`chip${filter === m.id ? ' chip--active' : ''}`}
            style={{ '--pill': m.color } as CSSProperties}
            onClick={() => setFilter(filter === m.id ? null : m.id)}
            aria-pressed={filter === m.id}
          >
            <span className="chip__dot" aria-hidden />
            {m.displayName.split(' ')[0]}
            <span className="chip__score" aria-label={`${pointsByMember.get(m.id) ?? 0} stars`}>
              ★ {pointsByMember.get(m.id) ?? 0}
            </span>
          </button>
        ))}
      </div>

      <form className="chore-form card" onSubmit={submit}>
        <input
          className="chore-form__title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a chore…"
          aria-label="Chore"
          maxLength={200}
        />
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label="Assign to">
          <option value={ANYONE}>Anyone</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" />
        <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} aria-label="Due time" disabled={!dueDate} />
        <input
          type="number"
          min={0}
          max={1000}
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
          aria-label="Points"
          className="chore-form__points"
        />
        <button type="submit" className="button button--primary" disabled={!title.trim()}>
          Add
        </button>
      </form>

      {open.length === 0 && done.length === 0 ? (
        <p className="empty">Nothing here yet. Add the first chore above.</p>
      ) : (
        <>
          <ul className="chore-list" aria-label="To do">
            {open.map(renderChore)}
          </ul>
          {open.length === 0 && <p className="empty">All done! 🎉</p>}
          {done.length > 0 && (
            <details className="done-section">
              <summary>Done ({done.length})</summary>
              <ul className="chore-list" aria-label="Done">
                {done.map(renderChore)}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}
