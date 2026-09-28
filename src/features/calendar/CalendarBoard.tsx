import { useMemo } from 'react'
import { useFitHeight } from '../../lib/useFitHeight'
import { fromDateKey } from '../../lib/dates'
import type { CalendarEvent, Member, SyncedCalendar } from '../../types'
import { useSettings } from '../settings/SettingsContext'
import { DayWeather } from '../weather/WeatherBadges'
import { EventChip } from './EventChip'
import { groupByDay } from './events'
import { isWeekend, weekdayHeaders, withOwners, type CalendarViewKind, type OwnedEvent, type ViewRange } from './views'

interface Props {
  kind: CalendarViewKind
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

export function CalendarBoard({ kind, range, today, now, events, members, calendars = [], onDelete }: Props) {
  const { settings } = useSettings()
  const columns = kind === 'week' || kind === 'threeDay'
  const [fitRef, fitStyle] = useFitHeight<HTMLOListElement>(columns)
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
                  {date.getDate() === 1 ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : date.getDate()}
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
    <ol ref={fitRef} style={fitStyle} className={`week week--fit${kind === 'threeDay' ? ' week--3' : ''}`}>
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
