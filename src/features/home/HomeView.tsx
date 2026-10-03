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
import { DEFAULT_HOME, PANEL_WEIGHT, type HomePanel } from './homePanels'

export type HomeTarget = 'calendar' | 'chores' | 'lists' | 'weather'

interface Props {
  today: string
  now: Date
  weekStart: string
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
}

// Busy days scroll inside their cell; past this many, point to the Calendar tab.
const CELL_LIMIT = 8
const GRABS = '__grabs__'

/** Skylight-style home: the main lists, today's tasks by person, and this week's calendar, in the order Settings chooses. */
export function HomeView(p: Props) {
  const { settings } = useSettings()
  const memberById = useMemo(() => new Map(p.members.map((m) => [m.id, m])), [p.members])
  const calendarByKey = useMemo(() => new Map(p.calendars.map((c) => [c.key, c])), [p.calendars])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(p.weekStart, i)), [p.weekStart])
  const nextWeek = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(p.weekStart, 7 + i)), [p.weekStart])
  const owned = useMemo(() => withOwners(p.events, calendarByKey), [p.events, calendarByKey])
  const byDay = useMemo(() => groupByDay(owned, [...days, ...nextWeek]) as Record<string, OwnedEvent[]>, [owned, days, nextWeek])
  const nextWeekEvents = [...new Map(nextWeek.flatMap((d) => byDay[d]).map((e) => [e.id, e])).values()]
  const range = (a: string, b: string) => `${fromDateKey(a).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} – ${fromDateKey(b).getDate()}`

  const people = [...p.members.map((m) => ({ id: m.id, member: m as Member | null })), { id: GRABS, member: null }]
  const choresFor = (id: string) => p.chores.filter((c) => (id === GRABS ? !c.assigneeId || !memberById.has(c.assigneeId) : c.assigneeId === id))

  const panels = p.panels ?? DEFAULT_HOME
  const shown: Record<HomePanel, () => ReactNode> = {
    calendar: () => (
        <section className="home-panel home-panel--calendar" aria-label="This week">
          <PanelHead title="Calendar" onOpen={() => p.onNavigate('calendar')} />
          <div className="home-week">
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
                    {list.slice(0, CELL_LIMIT).map((e) => (
                      <li key={e.id}>
                        <EventChip event={e} members={memberById} calendars={calendarByKey} now={p.now} today={p.today} compact="column" />
                      </li>
                    ))}
                  </ul>
                  {list.length > CELL_LIMIT && <span className="month-cell__more">+{list.length - CELL_LIMIT} more</span>}
                </div>
              )
            })}
            <button type="button" className="home-day home-day--next" onClick={() => p.onNavigate('calendar')} aria-label="Next week">
              <span className="home-day__next-title">Next Week</span>
              <span className="muted">{range(nextWeek[0], nextWeek[6])}</span>
              <span className="day__count">{nextWeekEvents.length ? `${nextWeekEvents.length} event${nextWeekEvents.length === 1 ? '' : 's'}` : 'Nothing yet'}</span>
              <ul className="home-next">
                {nextWeekEvents.slice(0, 4).map((e) => (
                  <li key={e.id}>{e.title}</li>
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
                      {member ? member.displayName.charAt(0) : '✦'}
                    </span>
                    <span className="home-person__name">{name}</span>
                    <span className="home-person__count" aria-label={`${done} of ${occ.length} done`}>
                      ✓ {done}/{occ.length}
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
    <div className="home" style={{ '--home-rows': panels.map((id) => `minmax(0, ${PANEL_WEIGHT[id]}fr)`).join(' ') } as CSSProperties}>
      {panels.map((id) => (
        <Fragment key={id}>{shown[id]()}</Fragment>
      ))}
    </div>
  )
}

function PanelHead({ title, onOpen }: { title: string; onOpen: () => void }) {
  return (
    <header className="home-panel__head">
      <h2>{title}</h2>
      <button type="button" className="link" onClick={onOpen} aria-label={`Open ${title}`}>
        Open →
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
