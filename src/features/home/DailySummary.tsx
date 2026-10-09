import { useMemo, useState, type CSSProperties } from 'react'
import { AlertIcon, CartIcon, DoneIcon, GrabsIcon, MapPinIcon, MealsIcon, NextIcon } from '../../components/Icons'
import { addDays, fromDateKey } from '../../lib/dates'
import type { Member, SyncedCalendar } from '../../types'
import { EventDetails } from '../calendar/EventDetails'
import type { OwnedEvent } from '../calendar/views'
import type { Occurrence } from '../chores/schedule'
import type { ShownCountdown } from '../countdowns/countdownsApi'
import type { ListItem } from '../lists/listsApi'
import { WeatherGlyph } from '../weather/WeatherBadges'
import { useWeatherInfo } from '../weather/WeatherContext'
import { allDayOn, daySentence, greeting, nextUp, relative, timeline, weatherLine } from './summary'

export type SummaryTarget = 'calendar' | 'chores' | 'lists' | 'weather' | 'meals'

interface Props {
  today: string
  now: Date
  /** Today's and tomorrow's events, with their people. */
  events: OwnedEvent[]
  members: Member[]
  calendars: SyncedCalendar[]
  /** Today's chores (with whoever's turn it is). */
  chores: Occurrence[]
  dinner: string
  tomorrowDinner: string
  /** What's still to get on the grocery list (null while it loads). */
  grocery: ListItem[] | null
  countdowns: ShownCountdown[]
  onNavigate: (target: SummaryTarget) => void
  onToggleChore: (o: Occurrence, done: boolean, doneBy: string | null) => void
}

const clock = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const first = (m: Member | undefined) => m?.displayName.split(' ')[0] ?? ''
const daysUntil = (today: string, date: string) => Math.round((fromDateKey(date).getTime() - fromDateKey(today).getTime()) / 86_400_000)

/**
 * Home's daily summary: the day at a glance, told rather than tabulated. A greeting and one
 * sentence for the day, what's next, today's timeline, everyone's chores, dinner, the grocery
 * list, and what's coming up. Everything links to its own tab.
 */
export function DailySummary(p: Props) {
  const { forecast, alerts } = useWeatherInfo()
  const memberById = useMemo(() => new Map(p.members.map((m) => [m.id, m])), [p.members])
  const calendarByKey = useMemo(() => new Map(p.calendars.map((c) => [c.key, c])), [p.calendars])
  const [open, setOpen] = useState<OwnedEvent | null>(null)

  const rows = timeline(p.events, p.chores, p.today, p.now)
  const allDay = allDayOn(p.events, p.today)
  const next = nextUp(p.events, p.now, p.today)
  const left = {
    events: rows.filter((r) => r.kind === 'event' && !r.past).length + allDay.length,
    chores: p.chores.filter((o) => !o.done).length,
    dinner: p.dinner,
  }
  const weather = weatherLine(forecast, p.today, p.now)
  const tomorrow = addDays(p.today, 1)
  const tomorrowEvents = p.events.filter((e) => (e.allDay ? (e.startDate ?? '') <= tomorrow && (e.endDate ?? '') > tomorrow : fromDateKey(tomorrow) <= e.start && e.start < fromDateKey(addDays(tomorrow, 1))))
  const tomorrowHigh = forecast?.daily.find((d) => d.date === tomorrow)?.high
  const firstTomorrow = tomorrowEvents.filter((e) => !e.allDay).sort((a, b) => a.start.getTime() - b.start.getTime())[0]
  const soon = p.countdowns.filter((c) => c.date >= p.today).slice(0, 2)

  const avatars = (ids: string[]) => (
    <span className="summary-avatars" aria-hidden>
      {ids.slice(0, 4).map((id) => {
        const m = memberById.get(id)
        return m ? (
          <span key={id} className="initial" style={{ '--pill': m.color } as CSSProperties}>
            {m.displayName.charAt(0)}
          </span>
        ) : null
      })}
    </span>
  )
  const who = (ids: string[]) => ids.map((id) => first(memberById.get(id))).filter(Boolean).join(', ')

  // Chores by person, for the progress rings.
  const people = [...p.members.map((m) => ({ id: m.id as string | null, member: m as Member | undefined })), { id: null, member: undefined }]
    .map(({ id, member }) => {
      const mine = p.chores.filter((o) => (id ? o.chore.assigneeId === id : !o.chore.assigneeId || !memberById.has(o.chore.assigneeId)))
      return { id, member, total: mine.length, done: mine.filter((o) => o.done).length, next: mine.find((o) => !o.done) }
    })
    .filter((x) => x.member || x.total > 0)

  return (
    <div className="summary">
      <header className="summary__hero">
        <div className="summary__intro">
          <p className="summary__greeting">{greeting(p.now)}</p>
          <h1 className="summary__headline">{daySentence(left)}</h1>
        </div>
        {weather && (
          <button type="button" className="summary__weather" onClick={() => p.onNavigate('weather')} aria-label={`Weather: ${weather}. Open the forecast`}>
            {forecast && <WeatherGlyph code={forecast.current.code} isDay={forecast.current.isDay} size={28} />}
            <span>{weather}</span>
          </button>
        )}
      </header>
      {alerts[0] && (
        <button type="button" className="summary__alert" onClick={() => p.onNavigate('weather')}>
          <AlertIcon size={18} aria-hidden /> {alerts[0].event}
          {alerts.length > 1 && <span className="muted"> and {alerts.length - 1} more</span>}
        </button>
      )}

      <div className="summary__grid">
        <div className="summary__main">
          <section className={`summary-card summary-next${next?.ongoing ? ' summary-next--now' : ''}`} aria-label="Up next">
            <p className="summary-card__label">{next ? (next.ongoing ? 'Happening now' : next.tomorrow ? 'First thing tomorrow' : 'Up next') : 'Up next'}</p>
            {next ? (
              <button type="button" className="summary-next__body" onClick={() => setOpen(next.event)}>
                <span className="summary-next__title">{next.event.title}</span>
                <span className="summary-next__when">
                  {next.ongoing ? `Until ${clock(next.event.end)}` : next.tomorrow ? `Tomorrow at ${clock(next.event.start)}` : `${relative(p.now, next.event.start)} · ${clock(next.event.start)}`}
                </span>
                {next.event.location && (
                  <span className="summary-next__where">
                    <MapPinIcon size={16} aria-hidden /> {next.event.location}
                  </span>
                )}
                {next.event.ownerIds.length > 0 && (
                  <span className="summary-next__who">
                    {avatars(next.event.ownerIds)} {who(next.event.ownerIds)}
                  </span>
                )}
                {next.ongoing && (
                  <span className="summary-next__bar" aria-hidden>
                    <span style={{ width: `${Math.min(100, Math.max(0, ((p.now.getTime() - next.event.start.getTime()) / (next.event.end.getTime() - next.event.start.getTime())) * 100))}%` }} />
                  </span>
                )}
              </button>
            ) : (
              <p className="summary-next__empty">Nothing else on the calendar today or tomorrow.</p>
            )}
          </section>

          <section className="summary-card summary-day" aria-label="Today">
            <div className="summary-card__head">
              <h2 className="summary-card__label">Today</h2>
              <button type="button" className="link" onClick={() => p.onNavigate('calendar')}>
                Calendar <NextIcon size={16} aria-hidden />
              </button>
            </div>
            {allDay.length > 0 && (
              <ul className="summary-allday" aria-label="All day">
                {allDay.map((e) => (
                  <li key={e.id}>
                    <button type="button" className="summary-allday__item" style={{ '--pill': memberById.get(e.ownerIds[0] ?? '')?.color ?? 'var(--accent)' } as CSSProperties} onClick={() => setOpen(e)}>
                      {e.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {rows.length === 0 && allDay.length === 0 ? (
              <p className="muted summary-day__empty">No events or timed chores today.</p>
            ) : (
              <ol className="summary-timeline">
                {rows.map((r, i) => {
                  const nowLine = !r.past && (i === 0 || rows[i - 1].past) && rows.some((x) => x.past)
                  if (r.kind === 'event') {
                    const color = memberById.get(r.event.ownerIds[0] ?? '')?.color ?? 'var(--accent)'
                    return (
                      <li key={r.key} className={`summary-row${r.past ? ' summary-row--past' : ''}${nowLine ? ' summary-row--after-now' : ''}`} style={{ '--pill': color } as CSSProperties}>
                        <span className="summary-row__time">{clock(r.at)}</span>
                        <button type="button" className="summary-row__body" onClick={() => setOpen(r.event)}>
                          <span className="summary-row__title">{r.event.title}</span>
                          {r.event.ownerIds.length > 0 && <span className="summary-row__meta">{who(r.event.ownerIds)}</span>}
                        </button>
                      </li>
                    )
                  }
                  const o = r.occurrence
                  const m = memberById.get(o.chore.assigneeId ?? '')
                  return (
                    <li key={r.key} className={`summary-row summary-row--chore${r.past ? ' summary-row--past' : ''}${nowLine ? ' summary-row--after-now' : ''}`} style={{ '--pill': m?.color ?? 'var(--ink-3)' } as CSSProperties}>
                      <span className="summary-row__time">{clock(r.at)}</span>
                      <span className="summary-row__body">
                        <span className="summary-row__title">{o.chore.title}</span>
                        <span className="summary-row__meta">Chore{m ? ` · ${first(m)}` : ' · up for grabs'}</span>
                      </span>
                      {m && (
                        <button type="button" className={`check-circle${o.done ? ' check-circle--on' : ''}`} aria-pressed={o.done} aria-label={`${o.done ? 'Undo' : 'Mark done'}: ${o.chore.title}`} onClick={() => p.onToggleChore(o, !o.done, null)} />
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </div>

        <div className="summary__side">
          <section className="summary-card" aria-label="Chores">
            <div className="summary-card__head">
              <h2 className="summary-card__label">Chores</h2>
              <button type="button" className="link" onClick={() => p.onNavigate('chores')}>
                All chores <NextIcon size={16} aria-hidden />
              </button>
            </div>
            <ul className="summary-people">
              {people.map(({ id, member, total, done, next: todo }) => {
                const share = total ? done / total : 1
                const name = member ? first(member) : 'Up for grabs'
                return (
                  <li key={id ?? 'grabs'} className="summary-person" style={{ '--pill': member?.color ?? 'var(--ink-2)' } as CSSProperties}>
                    <span className="summary-ring" aria-hidden>
                      <svg viewBox="0 0 36 36">
                        <circle className="summary-ring__track" cx="18" cy="18" r="15.5" />
                        {share > 0 && <circle className="summary-ring__fill" cx="18" cy="18" r="15.5" strokeDasharray={`${share * 97.4} 97.4`} />}
                      </svg>
                      <span className="summary-ring__mark">{total > 0 && done === total ? <DoneIcon size={16} /> : member ? member.displayName.charAt(0) : <GrabsIcon size={16} />}</span>
                    </span>
                    <span className="summary-person__text">
                      <span className="summary-person__name">{name}</span>
                      <span className="summary-person__meta">{total === 0 ? 'Nothing today' : done === total ? 'All done' : `${done} of ${total} done · next: ${todo?.chore.title}`}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>

          <div className="summary__pair">
            <button type="button" className="summary-card summary-tile" onClick={() => p.onNavigate('meals')}>
              <span className="summary-card__label">
                <MealsIcon size={16} aria-hidden /> Dinner
              </span>
              <span className="summary-tile__value">{p.dinner.trim() || 'Not planned yet'}</span>
              {p.tomorrowDinner.trim() && <span className="summary-tile__meta">Tomorrow: {p.tomorrowDinner.trim()}</span>}
            </button>
            <button type="button" className="summary-card summary-tile" onClick={() => p.onNavigate('lists')}>
              <span className="summary-card__label">
                <CartIcon size={16} aria-hidden /> Grocery list
              </span>
              <span className="summary-tile__value">{p.grocery === null ? '…' : p.grocery.length === 0 ? 'All set' : `${p.grocery.length} to get`}</span>
              {p.grocery && p.grocery.length > 0 && <span className="summary-tile__meta">{p.grocery.slice(0, 4).map((i) => i.text).join(', ')}</span>}
            </button>
          </div>

          <section className="summary-card" aria-label="Coming up">
            <h2 className="summary-card__label">Coming up</h2>
            <ul className="summary-ahead">
              <li>
                <span className="summary-ahead__when">Tomorrow</span>
                <span>
                  {tomorrowEvents.length === 0
                    ? 'Nothing on the calendar'
                    : `${tomorrowEvents.length} event${tomorrowEvents.length === 1 ? '' : 's'}${firstTomorrow ? `, first at ${clock(firstTomorrow.start)}` : ''}`}
                  {tomorrowHigh !== undefined && ` · high ${tomorrowHigh}°`}
                </span>
              </li>
              {soon.map((c) => {
                const n = daysUntil(p.today, c.date)
                return (
                  <li key={c.id}>
                    <span className="summary-ahead__when">{n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days`}</span>
                    <span>
                      {c.title}
                      {c.detail && <span className="muted"> · {c.detail}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      </div>
      {open && <EventDetails event={open} members={memberById} calendars={calendarByKey} onClose={() => setOpen(null)} />}
    </div>
  )
}
