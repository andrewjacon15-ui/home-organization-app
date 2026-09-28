import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, Member } from '../../types'
import { CalendarConnect } from './CalendarConnect'
import { StaticSettings } from '../settings/SettingsContext'
import type { DisplaySettings } from '../settings/settingsApi'
import { AddEventForm } from './AddEventForm'
import { CalendarBoard } from './CalendarBoard'
import { buildManualEvent, eventDateKeys, groupByDay } from './events'
import { countdownLabel, viewRange, withOwners, type CalendarViewKind } from './views'

const WEEK = '2026-09-27' // Sunday
const TODAY = '2026-09-29'

const members: Member[] = [
  { id: 'a', displayName: 'Andrew', email: 'a@x.com', color: '#e76f51' },
  { id: 'b', displayName: 'Bea', email: 'b@x.com', color: '#2a9d8f' },
]

const local = (s: string) => new Date(s) // no Z: local time, like the device
const ev = (over: Partial<CalendarEvent> & Pick<CalendarEvent, 'id' | 'title'>): CalendarEvent => ({
  source: 'google',
  sourceUserId: 'a',
  start: local('2026-09-29T09:00'),
  end: local('2026-09-29T10:00'),
  allDay: false,
  ...over,
})

const events: CalendarEvent[] = [
  ev({ id: 'late', title: 'Soccer', start: local('2026-09-29T17:00'), end: local('2026-09-29T18:00'), sourceUserId: 'b' }),
  ev({ id: 'early', title: 'Standup', start: local('2026-09-29T08:30'), end: local('2026-09-29T09:00') }),
  ev({ id: 'trip', title: 'Beach trip', allDay: true, startDate: '2026-09-29', endDate: '2026-10-02', start: new Date(Date.UTC(2026, 8, 29)), end: new Date(Date.UTC(2026, 9, 2)) }),
  ev({ id: 'dentist', title: 'Dentist', source: 'manual', sourceUserId: 'b', start: local('2026-10-01T15:00'), end: local('2026-10-01T16:00') }),
]

describe('event date logic', () => {
  it('spans all-day events up to (not including) the end date', () => {
    expect(eventDateKeys(events[2])).toEqual(['2026-09-29', '2026-09-30', '2026-10-01'])
  })

  it('puts overnight timed events on both days, but not events ending at midnight', () => {
    expect(eventDateKeys(ev({ id: 'x', title: 'x', start: local('2026-09-29T22:00'), end: local('2026-09-30T02:00') }))).toEqual(['2026-09-29', '2026-09-30'])
    expect(eventDateKeys(ev({ id: 'y', title: 'y', start: local('2026-09-29T22:00'), end: local('2026-09-30T00:00') }))).toEqual(['2026-09-29'])
  })

  it('orders a day all-day first, then by start time', () => {
    const byDay = groupByDay(events, [TODAY])
    expect(byDay[TODAY].map((e) => e.title)).toEqual(['Beach trip', 'Standup', 'Soccer'])
  })

  it('builds timed and all-day manual events', () => {
    expect(buildManualEvent({ title: ' Party ', date: '2026-10-03', allDay: false, startTime: '18:00', endTime: '17:00' })).toEqual({
      title: 'Party',
      allDay: false,
      start: local('2026-10-03T18:00'),
      end: local('2026-10-03T19:00'), // end before start → one hour
    })
    expect(buildManualEvent({ title: 'Holiday', date: '2026-10-12', allDay: true, startTime: '', endTime: '' })).toEqual({
      title: 'Holiday',
      allDay: true,
      startDate: '2026-10-12',
      endDate: '2026-10-13',
      start: new Date(Date.UTC(2026, 9, 12)),
      end: new Date(Date.UTC(2026, 9, 13)),
    })
  })
})

const NOW = local('2026-09-29T12:00')

const base = { weekStartsOn: 0, weekStartToday: false, monthStartCurrentWeek: true, scheduleDays: 7, scheduleStartToday: false }

function board(kind: CalendarViewKind = 'week', settings: Partial<DisplaySettings> = {}, list = events) {
  const onDelete = vi.fn()
  const s = { ...base, ...settings }
  render(
    <StaticSettings settings={settings}>
      <CalendarBoard kind={kind} range={viewRange(kind, TODAY, 0, s)} today={TODAY} now={NOW} events={list} members={members} onDelete={onDelete} />
    </StaticSettings>,
  )
  return { onDelete, user: userEvent.setup() }
}

describe('viewRange', () => {
  it('weeks start on the chosen weekday, or today', () => {
    expect(viewRange('week', TODAY, 0, base).days[0]).toBe(WEEK)
    expect(viewRange('week', TODAY, 0, { ...base, weekStartsOn: 1 }).days[0]).toBe('2026-09-28')
    expect(viewRange('week', TODAY, 0, { ...base, weekStartToday: true }).days[0]).toBe(TODAY)
    expect(viewRange('week', TODAY, 1, base).days[0]).toBe('2026-10-04')
  })

  it('month view is five rolling weeks, or the calendar month padded to whole weeks', () => {
    const rolling = viewRange('month', TODAY, 0, base)
    expect(rolling.days).toHaveLength(35)
    expect(rolling.days[0]).toBe(WEEK)
    expect(rolling.focusMonth).toBeNull()

    const month = viewRange('month', TODAY, 0, { ...base, monthStartCurrentWeek: false })
    expect(month.days[0]).toBe('2026-08-30') // Sunday before Sep 1
    expect(month.days.at(-1)).toBe('2026-10-03') // Saturday after Sep 30
    expect(month.focusMonth).toBe(8)
    expect(viewRange('month', TODAY, 1, { ...base, monthStartCurrentWeek: false }).label).toMatch(/October 2026/)
  })

  it('schedule view shows N days from the week start or today', () => {
    expect(viewRange('schedule', TODAY, 0, { ...base, scheduleDays: 3 }).days).toEqual([WEEK, '2026-09-28', TODAY])
    expect(viewRange('schedule', TODAY, 1, { ...base, scheduleDays: 3, scheduleStartToday: true }).days[0]).toBe('2026-10-02')
  })
})

describe('owners and countdowns', () => {
  it('merges the same Google event from two people into one shared event', () => {
    const shared = [
      ev({ id: 'a1', title: 'Dinner', sourceUserId: 'a' }),
      ev({ id: 'b1', title: 'Dinner', sourceUserId: 'b' }),
      ev({ id: 'm1', title: 'Dinner', source: 'manual', sourceUserId: 'a', memberIds: ['a', 'b'] }),
    ]
    const owned = withOwners(shared)
    expect(owned).toHaveLength(2)
    expect(owned[0].ownerIds).toEqual(['a', 'b'])
    expect(owned[1].ownerIds).toEqual(['a', 'b'])
  })

  it('counts down to events later today only', () => {
    expect(countdownLabel(ev({ id: 'x', title: 'x', start: local('2026-09-29T12:45') }), NOW)).toBe('in 45 min')
    expect(countdownLabel(ev({ id: 'x', title: 'x', start: local('2026-09-29T14:30') }), NOW)).toBe('in 2 hr 30 min')
    expect(countdownLabel(ev({ id: 'x', title: 'x', start: local('2026-09-29T09:00') }), NOW)).toBeNull()
    expect(countdownLabel(ev({ id: 'x', title: 'x', start: local('2026-09-30T09:00') }), NOW)).toBeNull()
  })
})

describe('CalendarBoard', () => {
  it('week view: merged events per day with counts and owner initials', () => {
    board('week')
    const tue = screen.getByRole('listitem', { current: 'date' })
    expect(within(tue).getByText('3 events')).toBeInTheDocument()
    const titles = within(tue).getAllByText(/Beach trip|Standup|Soccer/).map((n) => n.textContent)
    expect(titles).toEqual(['Beach trip', 'Standup', 'Soccer'])
    expect(within(tue).getByLabelText('For Bea')).toBeInTheDocument()
    expect(within(screen.getByLabelText(/Thursday, October 1/)).getByText('Beach trip')).toBeInTheDocument()
  })

  it('dims past events and shows countdowns, both switchable', () => {
    board('week')
    expect(screen.getByText('Standup').closest('.event')).toHaveClass('event--past')
    expect(screen.getByText(/in 5 hr/)).toBeInTheDocument() // Soccer at 5 PM
    cleanup()
    board('week', { dimPastEvents: false, showCountdowns: 'never' })
    expect(screen.getByText('Standup').closest('.event')).not.toHaveClass('event--past')
    expect(screen.queryByText(/in 5 hr/)).not.toBeInTheDocument()
  })

  it('shades weekends only when asked', () => {
    board('week', { shadeWeekends: true })
    expect(screen.getByLabelText(/Sunday, September 27/)).toHaveClass('day--weekend')
    expect(screen.getByLabelText(/Monday, September 28/)).not.toHaveClass('day--weekend')
  })

  it('stripes shared events with each owner color', () => {
    board('week', {}, [ev({ id: 'm', title: 'Family dinner', source: 'manual', sourceUserId: 'a', memberIds: ['a', 'b'] })])
    const chip = screen.getByText('Family dinner').closest('.event') as HTMLElement
    expect(chip.style.getPropertyValue('--owner-bar')).toContain('linear-gradient')
    expect(within(chip).getByLabelText('For Andrew, Bea')).toBeInTheDocument()
  })

  it('only lets you delete hand-entered events', async () => {
    const { onDelete, user } = board('week')
    expect(screen.queryByLabelText('Delete "Soccer"')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Delete "Dentist"'))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'dentist' }))
  })

  it('month view: a 35-day grid capping each cell at three events', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      ev({ id: `e${i}`, title: `Thing ${i}`, start: local(`2026-10-05T0${i + 1}:00`), end: local(`2026-10-05T0${i + 2}:00`) }),
    )
    board('month', {}, many)
    expect(screen.getAllByRole('gridcell')).toHaveLength(35)
    expect(within(screen.getByLabelText(/Monday, October 5/)).getByText('+2 more')).toBeInTheDocument()
  })

  it('schedule view: one row per day with an empty-day note', () => {
    board('schedule', { scheduleDays: 3 })
    expect(screen.getAllByText('Nothing planned')).toHaveLength(2) // Sun, Mon
    expect(within(screen.getByLabelText(/Tuesday, September 29/)).getByText('Soccer')).toBeInTheDocument()
  })
})

describe('AddEventForm', () => {
  it('adds an event for the chosen people, defaulting to you', async () => {
    const onAdd = vi.fn()
    const user = userEvent.setup()
    render(<AddEventForm defaultDate={TODAY} members={members} userId="a" onAdd={onAdd} />)
    await user.click(screen.getByRole('button', { name: '+ Add event' }))
    expect(screen.getByLabelText('Date')).toHaveValue(TODAY)
    expect(screen.getByRole('button', { name: /Andrew/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /Bea/ }))
    await user.type(screen.getByLabelText('Event title'), 'Piano lesson')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onAdd).toHaveBeenCalledWith({
      title: 'Piano lesson',
      allDay: false,
      start: local('2026-09-29T09:00'),
      end: local('2026-09-29T10:00'),
      memberIds: ['a', 'b'],
    })
  })
})

describe('CalendarConnect', () => {
  const handlers = () => ({ onConnect: vi.fn(), onSync: vi.fn(), onDisconnect: vi.fn() })

  it('offers to connect when not linked', async () => {
    const h = handlers()
    render(<CalendarConnect status={undefined} busy={false} {...h} />)
    await userEvent.click(screen.getByRole('button', { name: 'Connect my Google Calendar' }))
    expect(h.onConnect).toHaveBeenCalled()
  })

  it('shows the linked account with sync and disconnect', async () => {
    const h = handlers()
    const lastSyncAt = { toDate: () => new Date(Date.now() - 5 * 60_000) }
    render(<CalendarConnect status={{ status: 'connected', email: 'a@x.com', lastSyncAt }} busy={false} {...h} />)
    expect(screen.getByText('a@x.com')).toBeInTheDocument()
    expect(screen.getByText(/synced 5 min ago/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }))
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(h.onSync).toHaveBeenCalled()
    expect(h.onDisconnect).toHaveBeenCalled()
  })

  it('asks to reconnect when Google access expired', async () => {
    const h = handlers()
    render(<CalendarConnect status={{ status: 'needs_reconnect', email: 'a@x.com' }} busy={false} {...h} />)
    expect(screen.getByRole('status')).toHaveTextContent('expired')
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(h.onConnect).toHaveBeenCalled()
  })
})
