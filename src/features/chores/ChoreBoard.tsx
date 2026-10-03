import { useState, type CSSProperties } from 'react'
import { WeekNav } from '../../components/WeekNav'
import { addDays, fromDateKey, startOfWeek } from '../../lib/dates'
import { useFitHeight } from '../../lib/useFitHeight'
import type { Chore, Member, NewChore } from '../../types'
import { ChoreForm } from './ChoreForm'
import { dueLabel, occurrencesOn, repeatLabel, type Occurrence } from './schedule'
import { AddIcon, BackIcon, DoneIcon, GrabsIcon, NextIcon } from '../../components/Icons'

const GRABS = '__grabs__'

interface Props {
  chores: Chore[]
  members: Member[]
  stars: Map<string, number>
  today: string
  now: Date
  weekStartsOn: number
  onToggle: (o: Occurrence, done: boolean, doneBy: string | null) => void
  onAdd: (chore: NewChore) => void
  onDelete: (chore: Chore) => void
  /** Show only this person's column (plus Up for Grabs); null or absent shows everyone. */
  only?: string | null
}

/** Skylight-style chore board: a column per person plus "Up for Grabs", by day or by week. */
export function ChoreBoard({ chores, members, stars, today, now, weekStartsOn, onToggle, onAdd, onDelete, only = null }: Props) {
  const [view, setView] = useState<'day' | 'week'>('day')
  const [offset, setOffset] = useState(0)
  const [adding, setAdding] = useState<{ assignee: string | null } | null>(null)
  const [fitRef, fitStyle] = useFitHeight<HTMLDivElement>(view === 'day')

  const day = addDays(today, offset)
  const weekStart = addDays(startOfWeek(today, weekStartsOn), offset * 7)
  const shown = only ? members.filter((m) => m.id === only) : members
  const columns = [...shown.map((m) => ({ id: m.id, member: m as Member | null })), { id: GRABS, member: null }]
  const belongs = (c: Chore, colId: string) => (colId === GRABS ? !c.assigneeId || !members.some((m) => m.id === c.assigneeId) : c.assigneeId === colId)

  const toolbar = (
    <div className="chores__toolbar">
      {view === 'day' ? (
        <div className="week-nav">
          <button type="button" className="button" onClick={() => setOffset(offset - 1)} aria-label="Previous day">
            <BackIcon />
          </button>
          <h2 className="week-nav__label">{fromDateKey(day).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
          <button type="button" className="button" onClick={() => setOffset(offset + 1)} aria-label="Next day">
            <NextIcon />
          </button>
          {offset !== 0 && (
            <button type="button" className="link" onClick={() => setOffset(0)}>
              Today
            </button>
          )}
        </div>
      ) : (
        <WeekNav weekStart={weekStart} currentWeekStart={startOfWeek(today, weekStartsOn)} onWeekChange={(s) => setOffset(Math.round((fromDateKey(s).getTime() - fromDateKey(startOfWeek(today, weekStartsOn)).getTime()) / (7 * 86_400_000)))} />
      )}
      <div className="segmented" role="group" aria-label="View">
        {(['day', 'week'] as const).map((v) => (
          <button key={v} type="button" className={`segmented__item${view === v ? ' segmented__item--active' : ''}`} aria-pressed={view === v} onClick={() => (setView(v), setOffset(0))}>
            {v === 'day' ? 'Day' : 'Week'}
          </button>
        ))}
      </div>
      <button type="button" className="button add-event-toggle" onClick={() => setAdding({ assignee: null })}>
        <AddIcon />
        Add chore
      </button>
    </div>
  )

  return (
    <section className="chores2" aria-label="Chores">
      {toolbar}
      {adding && <ChoreForm members={members} defaultDate={view === 'day' ? day : today} defaultAssignee={adding.assignee} onAdd={onAdd} onCancel={() => setAdding(null)} />}

      {view === 'day' ? (
        <div className="chore-columns" ref={fitRef} style={fitStyle}>
          {columns.map(({ id, member }) => {
            const list = occurrencesOn(chores.filter((c) => belongs(c, id)), day, today)
            const done = list.filter((o) => o.done).length
            const name = member ? member.displayName.split(' ')[0] : 'Up for Grabs'
            return (
              <article key={id} className={`chore-col${member ? '' : ' chore-col--grabs'}`} style={{ '--pill': member?.color ?? 'var(--ink-2)' } as CSSProperties} aria-label={name}>
                <header className="chore-col__head">
                  <span className="avatar" aria-hidden>
                    {member ? member.displayName.charAt(0) : <GrabsIcon width={16} height={16} />}
                  </span>
                  <div className="chore-col__who">
                    <span className="chore-col__name">{name}</span>
                    <div className="chore-col__progress" aria-label={`${done} of ${list.length} done`}>
                      <div className="progress">
                        <div className="progress__fill" style={{ width: list.length ? `${(done / list.length) * 100}%` : 0 }} />
                      </div>
                      <span>
                        <DoneIcon width={14} height={14} aria-hidden /> {done}/{list.length}
                      </span>
                    </div>
                  </div>
                  {member && <span className="chore-col__stars" aria-label={`${stars.get(member.id) ?? 0} stars`}>★ {stars.get(member.id) ?? 0}</span>}
                </header>
                {list.length === 0 ? (
                  <div className="chore-col__empty">
                    <p>{member ? 'All clear.' : 'Chores anyone can tackle.'}</p>
                    <button type="button" className="link" aria-label={`Add chore for ${name}`} onClick={() => setAdding({ assignee: member?.id ?? null })}>
                      Add chore
                    </button>
                  </div>
                ) : (
                  <ul className="chore-cards">
                    {list.map((o) => (
                      <ChoreCard key={`${o.chore.id}_${o.date}`} o={o} members={members} now={now} today={today} onToggle={onToggle} onDelete={onDelete} />
                    ))}
                  </ul>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <WeekGrid
          chores={chores}
          columns={columns}
          belongs={belongs}
          weekStart={weekStart}
          today={today}
          members={members}
          onToggle={onToggle}
          onOpenDay={(d) => {
            setView('day')
            setOffset(Math.round((fromDateKey(d).getTime() - fromDateKey(today).getTime()) / 86_400_000))
          }}
        />
      )}
    </section>
  )
}

export function ChoreCard({ o, members, now, today, onToggle, onDelete }: { o: Occurrence; members: Member[]; now: Date; today: string; onToggle: Props['onToggle']; onDelete: Props['onDelete'] }) {
  const [asking, setAsking] = useState(false)
  const label = dueLabel(o, now, today)
  const repeats = repeatLabel(o.chore.repeat)
  const doer = o.doneBy ? members.find((m) => m.id === o.doneBy) : undefined
  const grabs = !o.chore.assigneeId

  function toggle() {
    if (o.done) return onToggle(o, false, null)
    // Up for Grabs: ask who did it so the right person gets the stars.
    if (grabs && o.chore.points > 0 && members.length > 1) return setAsking(true)
    onToggle(o, true, grabs ? (members[0]?.id ?? null) : null)
  }

  return (
    <li className={`chore-card${o.done ? ' chore-card--done' : ''}${label.late ? ' chore-card--late' : ''}`}>
      <div className="chore-card__body">
        <span className="chore-card__title">{o.chore.title}</span>
        <span className="chore-card__meta">
          {repeats && (
            <span className="chore-card__repeat" title={repeats} aria-label={repeats}>
              ↻
            </span>
          )}
          {label.text}
          {o.chore.points > 0 && <span className="chore-card__pts"> · ★ {o.chore.points}</span>}
          {o.done && doer && grabs && <span> · by {doer.displayName.split(' ')[0]}</span>}
        </span>
        {asking && (
          <div className="who-did-it" role="group" aria-label="Who did it?">
            <span className="muted">Who did it?</span>
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                className="chip"
                style={{ '--pill': m.color } as CSSProperties}
                onClick={() => {
                  setAsking(false)
                  onToggle(o, true, m.id)
                }}
              >
                <span className="chip__dot" aria-hidden />
                {m.displayName.split(' ')[0]}
              </button>
            ))}
            <button type="button" className="link" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
      <button type="button" className="icon-button chore-card__delete" onClick={() => confirm(`Delete "${o.chore.title}"${o.chore.repeat ? ' and all its repeats' : ''}?`) && onDelete(o.chore)} aria-label={`Delete ${o.chore.title}`}>
        ✕
      </button>
      <button type="button" className={`check-circle${o.done ? ' check-circle--on' : ''}`} onClick={toggle} aria-pressed={o.done} aria-label={`${o.done ? 'Undo' : 'Mark done'}: ${o.chore.title}`} />
    </li>
  )
}

function WeekGrid({
  chores,
  columns,
  belongs,
  weekStart,
  today,
  members,
  onToggle,
  onOpenDay,
}: {
  chores: Chore[]
  columns: { id: string; member: Member | null }[]
  belongs: (c: Chore, colId: string) => boolean
  weekStart: string
  today: string
  members: Member[]
  onToggle: Props['onToggle']
  /** Up for Grabs chores open the day view, where you pick who did it. */
  onOpenDay: (day: string) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  return (
    <div className="chore-week" role="table" aria-label="Chores this week">
      <div className="chore-week__row chore-week__row--head" role="row">
        <span role="columnheader" />
        {days.map((d) => (
          <span key={d} role="columnheader" className={d === today ? 'chore-week__today' : ''}>
            {fromDateKey(d).toLocaleDateString(undefined, { weekday: 'short' })} <b>{fromDateKey(d).getDate()}</b>
          </span>
        ))}
      </div>
      {columns.map(({ id, member }) => {
        const mine = chores.filter((c) => belongs(c, id))
        return (
          <div key={id} className="chore-week__row" role="row" style={{ '--pill': member?.color ?? 'var(--ink-2)' } as CSSProperties}>
            <span role="rowheader" className="chore-week__who">
              {member ? member.displayName.split(' ')[0] : 'Up for Grabs'}
            </span>
            {days.map((d) => (
              <div key={d} role="cell" className={`chore-week__cell${d === today ? ' chore-week__cell--today' : ''}`}>
                {occurrencesOn(mine, d, today).map((o) => (
                  <button
                    key={`${o.chore.id}_${o.date}`}
                    type="button"
                    className={`week-chip${o.done ? ' week-chip--done' : ''}`}
                    aria-pressed={o.done}
                    aria-label={`${o.done ? 'Undo' : 'Mark done'}: ${o.chore.title}, ${fromDateKey(d).toLocaleDateString(undefined, { weekday: 'long' })}`}
                    onClick={() => {
                      const grabs = !o.chore.assigneeId
                      if (!o.done && grabs && o.chore.points > 0 && members.length > 1) return onOpenDay(d)
                      onToggle(o, !o.done, !o.done && grabs ? (members[0]?.id ?? null) : null)
                    }}
                  >
                    {o.chore.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
