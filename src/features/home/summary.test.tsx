import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Chore, Member } from '../../types'
import type { OwnedEvent } from '../calendar/views'
import { occurrencesOn } from '../chores/schedule'
import { StaticWeather } from '../weather/WeatherContext'
import type { Forecast } from '../weather/weatherApi'
import { DailySummary } from './DailySummary'
import { daySentence, greeting, nextUp, relative, timeline, weatherLine } from './summary'

const at = (h: number, m = 0, day = 9) => new Date(2026, 9, day, h, m)
const ev = (id: string, title: string, start: Date, end: Date, extra: Partial<OwnedEvent> = {}): OwnedEvent => ({ id, source: 'manual', title, start, end, allDay: false, ownerIds: [], calendarKeys: [], ...extra }) as OwnedEvent
const members: Member[] = [
  { id: 'sam', displayName: 'Sam Rivera', color: '#15803d' },
  { id: 'lee', displayName: 'Lee Rivera', color: '#c2410c' },
] as Member[]
const chore = (id: string, title: string, assigneeId: string | null, extra: Partial<Chore> = {}): Chore => ({ id, title, assigneeId, dueDate: '2026-10-09', done: false, points: 1, ...extra })

describe('daily summary text', () => {
  it('greets by the time of day and sums up what is left', () => {
    expect(greeting(at(8))).toBe('Good morning')
    expect(greeting(at(14))).toBe('Good afternoon')
    expect(greeting(at(19))).toBe('Good evening')
    expect(daySentence({ events: 3, chores: 4, dinner: 'tacos' })).toBe('3 events, 4 chores to do and tacos for dinner.')
    expect(daySentence({ events: 1, chores: 0, dinner: '' })).toBe('1 event.')
    expect(daySentence({ events: 0, chores: 0, dinner: '' })).toBe('Nothing left on the calendar today.')
  })

  it('says when things are, relative to now', () => {
    expect(relative(at(9), at(9))).toBe('now')
    expect(relative(at(9), at(9, 25))).toBe('in 25 min')
    expect(relative(at(9), at(11, 10))).toBe('in 2 hr 10 min')
    expect(relative(at(9), at(18))).toMatch(/^at 6:00/)
  })

  it('picks what is on now, then what is next, then tomorrow', () => {
    const events = [ev('a', 'Dentist', at(9), at(10)), ev('b', 'Soccer', at(16), at(17)), ev('c', 'School', at(8, 0, 10), at(15, 0, 10))]
    expect(nextUp(events, at(9, 30), '2026-10-09')).toMatchObject({ event: { id: 'a' }, ongoing: true })
    expect(nextUp(events, at(11), '2026-10-09')).toMatchObject({ event: { id: 'b' }, ongoing: false, tomorrow: false })
    expect(nextUp(events, at(18), '2026-10-09')).toMatchObject({ event: { id: 'c' }, tomorrow: true })
  })

  it('puts timed events and timed chores on one timeline', () => {
    const occ = occurrencesOn([chore('t', 'Trash out', 'sam', { dueTime: '07:30' }), chore('u', 'Tidy up', 'lee')], '2026-10-09', '2026-10-09')
    const rows = timeline([ev('b', 'Soccer', at(16), at(17)), ev('a', 'Dentist', at(9), at(10))], occ, '2026-10-09', at(12))
    expect(rows.map((r) => [r.kind, r.past])).toEqual([
      ['chore', false],
      ['event', true],
      ['event', false],
    ])
  })

  it('describes the weather, with when rain is likely', () => {
    const f = {
      current: { temp: 64, code: 2, isDay: true },
      daily: [{ date: '2026-10-09', code: 61, high: 72, low: 58 }],
      hourly: [
        { time: '2026-10-09T13:00', temp: 70, code: 3, isDay: true, precipChance: 20, precip: 0, wind: 4 },
        { time: '2026-10-09T15:00', temp: 66, code: 61, isDay: true, precipChance: 70, precip: 1, wind: 6 },
      ],
      unit: 'F',
      fetchedAt: 0,
    } as Forecast
    expect(weatherLine(f, '2026-10-09', at(12))).toMatch(/^64° and partly cloudy · High 72°, low 58° · Rain likely around 3/)
    expect(weatherLine(null, '2026-10-09', at(12))).toBeNull()
  })
})

describe('DailySummary', () => {
  it('tells the day: next up, the timeline, chores by person, dinner and the grocery list', () => {
    const onNavigate = vi.fn()
    const onToggle = vi.fn()
    const chores = occurrencesOn([chore('t', 'Trash out', 'sam', { dueTime: '17:00' }), chore('u', 'Tidy up', 'lee', { done: true })], '2026-10-09', '2026-10-09')
    render(
      <StaticWeather forecast={null}>
        <DailySummary
          today="2026-10-09"
          now={at(9, 40)}
          events={[ev('a', 'Dentist', at(10), at(11), { ownerIds: ['sam'], location: '12 Main St' })]}
          members={members}
          calendars={[]}
          chores={chores}
          dinner="Tacos"
          tomorrowDinner=""
          grocery={[{ id: 'g1', text: 'Milk', done: false, memberId: null, order: 1 }]}
          countdowns={[{ id: 'h', title: 'Halloween', date: '2026-10-31', detail: null, kind: 'holiday', source: null }]}
          onNavigate={onNavigate}
          onToggleChore={onToggle}
        />
      </StaticWeather>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('1 event, 1 chore to do and Tacos for dinner.')
    const next = screen.getByRole('region', { name: 'Up next' })
    expect(next).toHaveTextContent('Dentist')
    expect(next).toHaveTextContent('in 20 min')
    expect(next).toHaveTextContent('12 Main St')
    const chorePanel = screen.getByRole('region', { name: 'Chores' })
    expect(chorePanel).toHaveTextContent('0 of 1 done · next: Trash out')
    expect(chorePanel).toHaveTextContent('All done')
    fireEvent.click(within(screen.getByRole('region', { name: 'Today' })).getByRole('button', { name: 'Mark done: Trash out' }))
    expect(onToggle).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Grocery list/ }))
    expect(onNavigate).toHaveBeenCalledWith('lists')
    expect(screen.getByRole('region', { name: 'Coming up' })).toHaveTextContent('22 daysHalloween')
  })
})
