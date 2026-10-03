import { Fragment, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { addDays, fromDateKey } from '../../lib/dates'
import type { CalendarEvent, Chore, Member, SyncedCalendar } from '../../types'
import { EventChip } from '../calendar/EventChip'
import { groupByDay } from '../calendar/events'
import { isWeekend, withOwners, type OwnedEvent } from '../calendar/views'
import { ChoreCard } from '../chores/ChoreBoard'
import { occurrencesOn, type Occurrence } from '../chores/schedule'
import type { FamilyList, ListItem } from '../lists/listsApi'
import { useSettings } from '../settings/SettingsContext'
import { DayWeather, WeatherStrip } from '../weather/WeatherBadges'
import { CountdownPanel } from '../countdowns/Countdowns'
import type { Countdown } from '../countdowns/countdownsApi'
import { DoneIcon, GrabsIcon, NextIcon } from '../../components/Icons'
import { useOverflowCue } from '../../lib/useOverflowCue'
import { DEFAULT_HOME, HOME_CALENDAR_DAYS, PANEL_WEIGHT, type HomeCalendarDays, type HomePanel } from './homePanels'

export type HomeTarget = 'calendar' | 'chores' | 'lists' | 'weather'

interface Props {
  today: string
  now: Date
  /** The first day the calendar shows, and how many. */
  start: string
  calendarDays: HomeCalendarDays
  onCalendarDays?: (days: HomeCalendarDays) => void
  events: CalendarEvent[]
  calendars: SyncedCalendar[]
  members: Member[]
  chores: Chore[]
  lists: FamilyList[]
  items: Record<string, ListItem[]>
  onNavigate: (target: HomeTarget) => void
  onToggleChore: (o: Occurrence, done: boolean, doneBy: string | null) => void
  onDeleteChore: (c: Chore) => void
  onAddItem: (list: FamilyList, text: string) => void
  onToggleItem: (list: FamilyList, item: ListItem) => void
  /** Which panels show, top to bottom (Settings → Home screen). */
  panels?: HomePanel[]
  countdowns?: Countdown[]
  onAddCountdown?: (title: string, date: string) => void
  onRemoveCountdown?: (c: Countdown) => void
}

const GRABS = '__grabs__'

/** Skylight-style home: the main lists, today's tasks by person, and this week's calendar, in the order Settings chooses. */
export function HomeView(p: Props) {
  const { settings } = useSettings()
  const memberById = useMemo(() => new Map(p.members.map((m) => [m.id, m])), [p.members])
  const calendarByKey = useMemo(() => new Map(p.calendars.map((c) => [c.key, c])), [p.calendars])
  const days = useMemo(() => Array.from({ length: p.calendarDays }, (_, i) => addDays(p.start, i)), [p.start, p.calendarDays])
  // The week after what's shown, summed up in the last tile.
  const later = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(p.start, p.calendarDays + i)), [p.start, p.calendarDays])
  const owned = useMemo(() => withOwners(p.events, calendarByKey), [p.events, calendarByKey])
  const byDay = useMemo(() => groupByDay(owned, [...days, ...later]) as Record<string, OwnedEvent[]>, [owned, days, later])
  const seen = new Set<string>()
  const laterEvents = later.flatMap((d) => byDay[d].filter((e) => !seen.has(e.id) && seen.add(e.id)).map((e) => ({ day: d, e })))
  const range = (a: string, b: string) => {
    const from = fromDateKey(a)
    const to = fromDateKey(b)
    return from.getMonth() === to.getMonth()
      ? `${from.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} – ${to.getDate()}`
      : `${from.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${to.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  }
  const cueRef = useOverflowCue<HTMLDivElement>(':scope > .home-day > .events', 'day--more')
  const cols = p.calendarDays === 7 ? 'repeat(8, minmax(0, 1fr))' : p.calendarDays === 3 ? 'repeat(3, minmax(0, 1fr)) minmax(0, 0.8fr)' : 'minmax(0, 2.4fr) minmax(0, 1fr)'

  const people = [...p.members.map((m) => ({ id: m.id, member: m as Member | null })), { id: GRABS, member: null }]
  const choresFor = (id: string) => p.chores.filter((c) => (id === GRABS ? !c.assigneeId || !memberById.has(c.assigneeId) : c.assigneeId === id))

  const panels = p.panels ?? DEFAULT_HOME
  const shown: Record<HomePanel, () => ReactNode> = {
    calendar: () => (
        <section className="home-panel home-panel--calendar" aria-label={p.calendarDays === 1 ? 'Today' : p.calendarDays === 3 ? 'Next 3 days' : 'This week'}>
          <PanelHead title="Calendar" onOpen={() => p.onNavigate('calendar')}>
            {p.onCalendarDays && (
              <div className="segmented segmented--small" role="group" aria-label="Days shown">
                {HOME_CALENDAR_DAYS.map((n) => (
                  <button key={n} type="button" className={`segmented__item${n === p.calendarDays ? ' segmented__item--active' : ''}`} aria-pressed={n === p.calendarDays} onClick={() => p.onCalendarDays?.(n)}>
                    {n === 1 ? '1 day' : `${n} days`}
                  </button>
                ))}
              </div>
            )}
          </PanelHead>
          <div ref={cueRef} className={`home-week home-week--${p.calendarDays}`} style={{ '--home-cols': cols } as CSSProperties}>
            {days.map((d) => {
              const list = byDay[d]
              return (
                <div key={d} className={`home-day${d === p.today ? ' home-day--today' : ''}${d < p.today ? ' home-day--past' : ''}${list.length === 0 ? ' home-day--empty' : ''}${settings.shadeWeekends && isWeekend(d) ? ' home-day--weekend' : ''}`} aria-label={fromDateKey(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
                  <div className="home-day__head">
                    <span className="home-day__name">
                      {fromDateKey(d).toLocaleDateString(undefined, { weekday: 'short' })} <b>{fromDateKey(d).getDate()}</b>
                    </span>
                    <DayWeather date={d} />
                  </div>
                  <span className="day__count">{list.length ? `${list.length} event${list.length === 1 ? '' : 's'}` : '—'}</span>
                  <ul className="events">
                    {list.map((e) => (
                      <li key={e.id}>
                        <EventChip event={e} members={memberById} calendars={calendarByKey} now={p.now} today={p.today} compact="column" />
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
            <button type="button" className="home-day home-day--next" onClick={() => p.onNavigate('calendar')} aria-label={p.calendarDays === 7 ? 'Next week' : 'Coming up'}>
              <span className="home-day__next-title">{p.calendarDays === 7 ? 'Next week' : 'Coming up'}</span>
              <span className="muted">{range(later[0], later[6])}</span>
              <span className="day__count">{laterEvents.length ? `${laterEvents.length} event${laterEvents.length === 1 ? '' : 's'}` : 'Nothing yet'}</span>
              <ul className="home-next">
                {laterEvents.slice(0, p.calendarDays === 1 ? 8 : 5).map(({ day, e }) => (
                  <li key={e.id}>
                    <span className="home-next__day">{fromDateKey(day).toLocaleDateString(undefined, { weekday: 'short' })}</span> {e.title}
                  </li>
                ))}
              </ul>
            </button>
          </div>
        </section>
    ),
    tasks: () => (
        <section className="home-panel home-panel--tasks" aria-label="Today's tasks">
          <PanelHead title="Today's tasks" onOpen={() => p.onNavigate('chores')} />
          <div className="home-tasks">
            {people.map(({ id, member }) => {
              const occ = occurrencesOn(choresFor(id), p.today, p.today)
              if (!member && occ.length === 0) return null
              const done = occ.filter((o) => o.done).length
              const name = member ? member.displayName.split(' ')[0] : 'Up for Grabs'
              return (
                <article key={id} className="home-person" style={{ '--pill': member?.color ?? 'var(--ink-2)' } as CSSProperties} aria-label={name}>
                  <header className="home-person__head">
                    <span className="avatar" aria-hidden>
                      {member ? member.displayName.charAt(0) : <GrabsIcon width={14} height={14} />}
                    </span>
                    <span className="home-person__name">{name}</span>
                    <span className="home-person__count" aria-label={`${done} of ${occ.length} done`}>
                      <DoneIcon width={14} height={14} aria-hidden /> {done}/{occ.length}
                    </span>
                  </header>
                  {occ.length === 0 ? (
                    <p className="muted home-person__clear">All clear today.</p>
                  ) : (
                    <ul className="chore-cards">
                      {occ.map((o) => (
                        <ChoreCard key={`${o.chore.id}_${o.date}`} o={o} members={p.members} now={p.now} today={p.today} onToggle={p.onToggleChore} onDelete={p.onDeleteChore} />
                      ))}
                    </ul>
                  )}
                </article>
              )
            })}
          </div>
        </section>
    ),
    countdowns: () => <CountdownPanel countdowns={p.countdowns ?? []} today={p.today} onAdd={(t, d) => p.onAddCountdown?.(t, d)} onRemove={(c) => p.onRemoveCountdown?.(c)} />,
    weather: () => (
      <section className="home-panel home-panel--weather" aria-label="Weather">
        <PanelHead title="Weather" onOpen={() => p.onNavigate('weather')} />
        <WeatherStrip />
      </section>
    ),
    lists: () => (
        <section className="home-panel home-panel--lists" aria-label="Lists">
          <PanelHead title="Lists" onOpen={() => p.onNavigate('lists')} />
          <div className="home-lists">
            {p.lists.slice(0, 2).map((l) => (
              <HomeList key={l.id} list={l} items={p.items[l.id] ?? []} onAdd={p.onAddItem} onToggle={p.onToggleItem} />
            ))}
            {p.lists.length === 0 && <p className="muted">No lists yet.</p>}
          </div>
        </section>
    ),
  }

  if (panels.length === 0) return <p className="empty">Nothing is set to show on Home. Choose panels in Settings → Home screen.</p>
  return (
    <div className="home" style={{ '--home-rows': panels.map((id) => (PANEL_WEIGHT[id] === 'auto' ? 'auto' : `minmax(0, ${PANEL_WEIGHT[id]}fr)`)).join(' ') } as CSSProperties}>
      {panels.map((id) => (
        <Fragment key={id}>{shown[id]()}</Fragment>
      ))}
    </div>
  )
}

function PanelHead({ title, onOpen, children }: { title: string; onOpen: () => void; children?: ReactNode }) {
  return (
    <header className="home-panel__head">
      <h2>{title}</h2>
      {children}
      <button type="button" className="link" onClick={onOpen} aria-label={`Open ${title}`}>
        Open <NextIcon width={16} height={16} aria-hidden />
      </button>
    </header>
  )
}

function HomeList({ list, items, onAdd, onToggle }: { list: FamilyList; items: ListItem[]; onAdd: Props['onAddItem']; onToggle: Props['onToggleItem'] }) {
  const [text, setText] = useState('')
  const open = items.filter((i) => !i.done).sort((a, b) => a.order - b.order)
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    onAdd(list, text)
    setText('')
  }
  return (
    <article className={`home-list list-col--${list.kind}`} aria-label={list.title}>
      <header className="home-list__head">
        <h3>{list.title}</h3>
        <span className="list-col__count" aria-label={`${open.length} to do`}>
          {open.length}
        </span>
      </header>
      <form className="add-item" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add item" aria-label={`Add to ${list.title}`} maxLength={300} />
      </form>
      <ul className="list-items">
        {open.map((i) => (
          <li key={i.id} className="list-item">
            <label className="list-item__check">
              <input type="checkbox" checked={false} onChange={() => onToggle(list, i)} aria-label={`Check off ${i.text}`} />
              <span className="list-item__text">{i.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </article>
  )
}
