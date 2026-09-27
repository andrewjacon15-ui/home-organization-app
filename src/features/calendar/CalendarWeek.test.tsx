import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, Member } from '../../types'
import { CalendarConnect } from './CalendarConnect'
import { CalendarWeek } from './CalendarWeek'
import { buildManualEvent, eventDateKeys, groupByDay } from './events'

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

function setup() {
  const props = {
    weekStart: WEEK,
    currentWeekStart: WEEK,
    today: TODAY,
    events,
    members,
    onWeekChange: vi.fn(),
    onAdd: vi.fn(),
    onDelete: vi.fn(),
  }
  render(<CalendarWeek {...props} />)
  return { props, user: userEvent.setup() }
}

describe('CalendarWeek', () => {
  it('shows each day’s merged events, attributed to their person', () => {
    setup()
    const tue = screen.getByRole('listitem', { current: 'date' })
    const titles = within(tue).getAllByText(/Beach trip|Standup|Soccer/).map((n) => n.textContent)
    expect(titles).toEqual(['Beach trip', 'Standup', 'Soccer'])
    expect(within(tue).getByText('(Bea)')).toBeInTheDocument()
    expect(within(tue).getByText('All day')).toBeInTheDocument()
    expect(within(screen.getByLabelText(/Thursday, October 1/)).getByText('Beach trip')).toBeInTheDocument()
    expect(within(screen.getByLabelText(/Friday, October 2/)).queryByText('Beach trip')).not.toBeInTheDocument()
  })

  it('only lets you delete hand-entered events', async () => {
    const { props, user } = setup()
    expect(screen.queryByLabelText('Delete "Soccer"')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Delete "Dentist"'))
    expect(props.onDelete).toHaveBeenCalledWith(events[3])
  })

  it('adds an event, defaulting to today', async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole('button', { name: '+ Add event' }))
    expect(screen.getByLabelText('Date')).toHaveValue(TODAY)
    await user.type(screen.getByLabelText('Event title'), 'Piano lesson')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(props.onAdd).toHaveBeenCalledWith({ title: 'Piano lesson', allDay: false, start: local('2026-09-29T09:00'), end: local('2026-09-29T10:00') })
    expect(screen.queryByRole('form', { name: 'New event' })).not.toBeInTheDocument()
  })

  it('shows a color legend when there are several people', () => {
    setup()
    expect(within(screen.getByRole('list', { name: 'Whose calendar' })).getAllByRole('listitem')).toHaveLength(2)
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
