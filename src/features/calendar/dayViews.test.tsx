import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, Member } from '../../types'
import { StaticSettings } from '../settings/SettingsContext'
import { CalendarBoard } from './CalendarBoard'
import { viewRange } from './views'

const TODAY = '2026-09-29'
const NOW = new Date('2026-09-29T12:00')
const base = { weekStartsOn: 0, weekStartToday: false, monthStartCurrentWeek: true, scheduleDays: 7, scheduleStartToday: false }
const members: Member[] = [{ id: 'a', displayName: 'Andrew', email: 'a@x.com', color: '#e76f51' }]
const ev = (id: string, title: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title,
  source: 'google',
  sourceUserId: 'a',
  start: new Date(start),
  end: new Date(end),
  allDay: false,
  ...extra,
})
const events = [
  ev('s', 'Soccer', '2026-09-29T17:00', '2026-09-29T18:00'),
  ev('u', 'Standup', '2026-09-29T08:30', '2026-09-29T09:00'),
  ev('t', 'Beach trip', '2026-09-29T00:00', '2026-10-02T00:00', { allDay: true, startDate: '2026-09-29', endDate: '2026-10-02' }),
  ev('d', 'Dentist', '2026-10-01T15:00', '2026-10-01T16:00'),
]

describe('day view', () => {
  it('pages one day at a time', () => {
    expect(viewRange('day', TODAY, 0, base).days).toEqual([TODAY])
    expect(viewRange('day', TODAY, -1, base).days).toEqual(['2026-09-28'])
  })

  it('lists one day, all-day first', () => {
    render(
      <StaticSettings>
        <CalendarBoard kind="day" range={viewRange('day', TODAY, 0, base)} today={TODAY} now={NOW} events={events} members={members} onDelete={vi.fn()} />
      </StaticSettings>,
    )
    const day = screen.getByRole('region', { name: /September 29/ })
    expect(within(day).getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(within(day).getAllByText(/^(Beach trip|Standup|Soccer)$/).map((n) => n.textContent)).toEqual(['Beach trip', 'Standup', 'Soccer'])
    expect(within(day).queryByText('Dentist')).not.toBeInTheDocument()
  })
})

describe('phone month', () => {
  it('shows dots, and the tapped day underneath', async () => {
    const user = userEvent.setup()
    render(
      <StaticSettings>
        <CalendarBoard kind="month" layout="phone" range={viewRange('month', TODAY, 0, base)} today={TODAY} now={NOW} events={events} members={members} onDelete={vi.fn()} />
      </StaticSettings>,
    )
    expect(screen.getByRole('gridcell', { name: /September 29, 3 events/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Soccer')).toBeInTheDocument()
    await user.click(screen.getByRole('gridcell', { name: /October 1, 2 events/ }))
    expect(screen.getByText('Dentist')).toBeInTheDocument()
    expect(screen.queryByText('Soccer')).not.toBeInTheDocument()
    await user.click(screen.getByRole('gridcell', { name: /October 3, nothing planned/ }))
    expect(screen.getByText('Nothing planned')).toBeInTheDocument()
  })
})
