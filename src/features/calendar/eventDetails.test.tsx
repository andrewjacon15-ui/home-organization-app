import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '../../types'
import { StaticSettings } from '../settings/SettingsContext'
import { EventChip } from './EventChip'
import { mapsLink, whenText } from './eventText'
import type { OwnedEvent } from './views'

const members = new Map<string, Member>([
  ['a', { id: 'a', displayName: 'Andrew', email: 'a@x.com', color: '#e76f51' }],
  ['l', { id: 'l', displayName: 'Lydia', email: 'l@x.com', color: '#2a9d8f' }],
])
const ev = (extra: Partial<OwnedEvent> = {}): OwnedEvent => ({
  id: 'e1',
  source: 'google',
  sourceUserId: 'a',
  title: 'Soccer practice',
  start: new Date('2026-10-03T09:00'),
  end: new Date('2026-10-03T10:30'),
  allDay: false,
  ownerIds: ['a', 'l'],
  calendarKeys: [],
  location: 'Piedmont Park, 400 Park Dr NE, Atlanta, GA',
  htmlLink: 'https://www.google.com/calendar/event?eid=abc',
  ...extra,
})

afterEach(() => vi.restoreAllMocks())

describe('event text', () => {
  it('says when, for timed, all-day, and multi-day events', () => {
    expect(whenText(ev())).toMatch(/Saturday, October 3 · 9:00\sAM – 10:30\sAM/)
    expect(whenText(ev({ allDay: true, startDate: '2026-10-03', endDate: '2026-10-04' }))).toBe('Saturday, October 3 · All day')
    expect(whenText(ev({ allDay: true, startDate: '2026-10-03', endDate: '2026-10-06' }))).toBe('Saturday, October 3 – Monday, October 5')
    expect(mapsLink('400 Park Dr NE, Atlanta')).toBe('https://www.google.com/maps/search/?api=1&query=400%20Park%20Dr%20NE%2C%20Atlanta')
  })
})

describe('tapping an event', () => {
  const chip = (e: OwnedEvent, onDelete = vi.fn()) =>
    render(
      <StaticSettings>
        <EventChip event={e} members={members} now={new Date('2026-10-03T08:00')} today="2026-10-03" compact="column" onDelete={onDelete} />
      </StaticSettings>,
    )

  it('opens the details: who, where with directions, and the Google Calendar link', async () => {
    const user = userEvent.setup()
    chip(ev())
    await user.click(screen.getByRole('button', { name: /^Soccer practice/ }))
    const sheet = screen.getByRole('dialog', { name: 'Soccer practice' })
    expect(within(sheet).getByRole('list', { name: 'Who' })).toHaveTextContent(/Andrew.*Lydia/)
    expect(within(sheet).getByText('Piedmont Park, 400 Park Dr NE, Atlanta, GA')).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Directions' })).toHaveAttribute('href', mapsLink('Piedmont Park, 400 Park Dr NE, Atlanta, GA'))
    expect(within(sheet).getByRole('link', { name: /Open in Google Calendar/ })).toHaveAttribute('href', 'https://www.google.com/calendar/event?eid=abc')
    expect(within(sheet).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lets you delete an event typed into the app, after confirming', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    chip(ev({ source: 'manual', location: undefined, htmlLink: undefined }), onDelete)
    await user.click(screen.getByRole('button', { name: /^Soccer practice/ }))
    const sheet = screen.getByRole('dialog', { name: 'Soccer practice' })
    expect(within(sheet).getByText('Added in Family Organizer')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
  })
})
