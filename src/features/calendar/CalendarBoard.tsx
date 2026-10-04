import { useMemo, useState } from 'react'
import { useFitHeight } from '../../lib/useFitHeight'
import { useOverflowCue } from '../../lib/useOverflowCue'
import { fromDateKey } from '../../lib/dates'
import type { CalendarEvent, Member, SyncedCalendar } from '../../types'
import { useSettings } from '../settings/SettingsContext'
import type { Device } from '../../lib/device'
import { DayForecastLine, DayWeather } from '../weather/WeatherBadges'
import { EventChip } from './EventChip'
import { groupByDay } from './events'
import { isWeekend, weekdayHeaders, withOwners, type CalendarViewKind, type OwnedEvent, type ViewRange } from './views'

interface Props {
  kind: CalendarViewKind
  /** Phones get their own month (dots + the chosen day). */
  layout?: Device
  range: ViewRange
  today: string
  now: Date
  events: CalendarEvent[]
  members: Member[]
  calendars?: SyncedCalendar[]
  onDelete: (event: CalendarEvent) => void
}

const MONTH_CELL_LIMIT = 3

const longLabel = (key: string) => fromDateKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

export function CalendarBoard({ kind, layout = 'desktop', range, today, now, events, members, calendars = [], onDelete }: Props) {
  const { settings } = useSettings()
  const [picked, setPicked] = useState<string | null>(null)
  const columns = kind === 'week' || kind === 'threeDay'
  const [fitRef, fitStyle] = useFitHeight<HTMLOListElement>(columns)
  // A busy day scrolls inside its column; fade its bottom edge so that reads as "more", not a cut-off.
  const cueRef = useOverflowCue<HTMLOListElement>(':scope > .day > .events', 'day--more')
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const calendarByKey = useMemo(() => new Map(calendars.map((c) => [c.key, c])), [calendars])
  const byDay = useMemo(() => groupByDay(withOwners(events, calendarByKey), range.days) as Record<string, OwnedEvent[]>, [events, calendarByKey, range.days])

  const dayClass = (key: string, base: string) =>
    [base, key === today && `${base}--today`, key < today && `${base}--past`, settings.shadeWeekends && isWeekend(key) && `${base}--weekend`,
      range.focusMonth !== null && fromDateKey(key).getMonth() !== range.focusMonth && `${base}--outside`]
      .filter(Boolean)
      .join(' ')

  const chip = (e: OwnedEvent, compact: boolean | 'column' = false) => (
    <li key={e.id}>
      <EventChip event={e} members={memberById} calendars={calendarByKey} now={now} today={today} compact={compact} onDelete={onDelete} />
    </li>
  )

  if (kind === 'day') {
    const key = range.days[0]
    return (
      <section className="card day-view" aria-label={longLabel(key)} aria-current={key === today ? 'date' : undefined}>
        <header className="day-view__head">
          <h3>{key === today ? 'Today' : fromDateKey(key).toLocaleDateString(undefined, { weekday: 'long' })}</h3>
          <DayForecastLine date={key} />
        </header>
        {byDay[key].length === 0 ? <p className="day__empty">Nothing planned</p> : <ul className="events">{byDay[key].map((e) => chip(e))}</ul>}
      </section>
    )
  }

  if (kind === 'month' && layout === 'phone') {
    // A phone can't fit event names in a month grid: show dots, and the picked day's events below.
    const fallback = range.days.includes(today) ? today : range.days.find((d) => range.focusMonth === null || fromDateKey(d).getMonth() === range.focusMonth)!
    const selected = picked && range.days.includes(picked) ? picked : fallback
    const dotColor = (e: OwnedEvent) => {
      const cal = settings.colorEventsBy === 'calendar' ? e.calendarKeys.map((k) => calendarByKey.get(k)?.color).find(Boolean) : undefined
      return cal ?? memberById.get(e.ownerIds[0])?.color ?? 'var(--ink-2)'
    }
    return (
      <div className="month-agenda">
        <div className="month" role="grid" aria-label="Month">
          <div className="month__head" role="row">
            {weekdayHeaders(settings.weekStartsOn).map((d) => (
              <span key={d} role="columnheader">{d.charAt(0)}</span>
            ))}
          </div>
          <div className="month__grid month__grid--dots">
            {range.days.map((key) => {
              const list = byDay[key]
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  className={`${dayClass(key, 'month-cell')} month-cell--dot${key === selected ? ' month-cell--selected' : ''}`}
                  aria-label={`${longLabel(key)}, ${list.length === 0 ? 'nothing planned' : `${list.length} event${list.length === 1 ? '' : 's'}`}`}
                  aria-pressed={key === selected}
                  aria-current={key === today ? 'date' : undefined}
                  onClick={() => setPicked(key)}
                >
                  <span className="month-cell__date">{fromDateKey(key).getDate()}</span>
                  <span className="month-cell__dots" aria-hidden>
                    {list.slice(0, 3).map((e) => (
                      <span key={e.id} className="month-cell__dot" style={{ background: dotColor(e) }} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <section className="month-agenda__day" aria-label={longLabel(selected)}>
          <header className="day-view__head">
            <h3>{selected === today ? 'Today' : fromDateKey(selected).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
            <DayForecastLine date={selected} />
          </header>
          {byDay[selected].length === 0 ? <p className="day__empty">Nothing planned</p> : <ul className="events">{byDay[selected].map((e) => chip(e))}</ul>}
        </section>
      </div>
    )
  }

  if (kind === 'month') {
    return (
      <div className="month" role="grid" aria-label="Month">
        <div className="month__head" role="row">
          {weekdayHeaders(settings.weekStartsOn).map((d) => (
            <span key={d} role="columnheader">{d}</span>
          ))}
        </div>
        <div className="month__grid">
          {range.days.map((key) => {
            const list = byDay[key]
            const date = fromDateKey(key)
            return (
              <div key={key} role="gridcell" className={dayClass(key, 'month-cell')} aria-label={longLabel(key)} aria-current={key === today ? 'date' : undefined}>
                <span className="month-cell__date">
                  {/* The number alone gets today's circle; the forecast sits beside it. */}
                  <span className="month-cell__num">{date.getDate() === 1 ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : date.getDate()}</span>
                  <DayWeather date={key} />
                </span>
                <ul className="events">{list.slice(0, MONTH_CELL_LIMIT).map((e) => chip(e, true))}</ul>
                {list.length > MONTH_CELL_LIMIT && <span className="month-cell__more">+{list.length - MONTH_CELL_LIMIT} more</span>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (kind === 'schedule') {
    return (
      <ol className="schedule">
        {range.days.map((key) => (
          <li key={key} className={dayClass(key, 'schedule-day')} aria-label={longLabel(key)} aria-current={key === today ? 'date' : undefined}>
            <div className="schedule-day__header">
              <span className="day__weekday">{fromDateKey(key).toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span className="day__date">{fromDateKey(key).getDate()}</span>
              {key === today && <span className="day__today">Today</span>}
              <DayWeather date={key} />
            </div>
            {byDay[key].length === 0 ? <p className="day__empty">Nothing planned</p> : <ul className="events">{byDay[key].map((e) => chip(e))}</ul>}
          </li>
        ))}
      </ol>
    )
  }

  return (
    <ol
      ref={(list) => {
        fitRef(list)
        cueRef(list)
      }}
      style={fitStyle} className={`week week--fit${kind === 'threeDay' ? ' week--3' : ''}`}>
      {range.days.map((key) => {
        const count = byDay[key].length
        return (
          <li key={key} className={`card ${dayClass(key, 'day')}`} aria-current={key === today ? 'date' : undefined} aria-label={longLabel(key)}>
            <div className="day__header">
              <span className="day__weekday">{fromDateKey(key).toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span className="day__date">{fromDateKey(key).getDate()}</span>
              <DayWeather date={key} />
            </div>
            <span className="day__count">{count === 0 ? '—' : `${count} event${count === 1 ? '' : 's'}`}</span>
            {count > 0 && <ul className="events">{byDay[key].map((e) => chip(e, kind === 'week' ? 'column' : false))}</ul>}
          </li>
        )
      })}
    </ol>
  )
}
