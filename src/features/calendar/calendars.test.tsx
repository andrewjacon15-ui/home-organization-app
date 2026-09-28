import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, Member, SyncedCalendar } from '../../types'
import { MyCalendars } from '../settings/MyCalendars'
import { StaticSettings } from '../settings/SettingsContext'
import { CalendarFilter } from './CalendarFilter'
import { EventChip } from './EventChip'
import { applyFilter } from './filter'
import { ownersOf, withOwners } from './views'

const members: Member[] = [
  { id: 'a', displayName: 'Andrew', email: 'a@x.com', color: '#15803d' },
  { id: 'l', displayName: 'Lydia', email: 'l@x.com', color: '#c2410c' },
]
const cal = (over: Partial<SyncedCalendar> & Pick<SyncedCalendar, 'key' | 'ownerId'>): SyncedCalendar => ({
  calendarId: over.key,
  name: over.key,
  googleColor: '#039be5',
  color: '#039be5',
  enabled: true,
  primary: false,
  memberIds: [over.ownerId],
  ...over,
})
const WORK = cal({ key: 'a_work', ownerId: 'a', name: 'Work', color: '#7e22ce' })
const FAMILY = cal({ key: 'l_fam', ownerId: 'l', name: 'Family', color: '#0f766e', memberIds: ['l', 'a'] })
const byKey = new Map([WORK, FAMILY].map((c) => [c.key, c]))

const ev = (over: Partial<CalendarEvent> & Pick<CalendarEvent, 'id' | 'title'>): CalendarEvent => ({
  source: 'google',
  sourceUserId: 'a',
  start: new Date('2026-09-29T15:00:00Z'),
  end: new Date('2026-09-29T16:00:00Z'),
  allDay: false,
  ...over,
})

describe('calendar ownership', () => {
  it('uses the calendar’s people for synced events, and chosen people for manual ones', () => {
    expect(ownersOf(ev({ id: '1', title: 'x', calendarKey: 'l_fam', sourceUserId: 'l' }), byKey)).toEqual(['l', 'a'])
    expect(ownersOf(ev({ id: '2', title: 'x', calendarKey: 'a_work' }), byKey)).toEqual(['a'])
    expect(ownersOf(ev({ id: '3', title: 'x', source: 'manual', memberIds: ['l'] }), byKey)).toEqual(['l'])
    expect(ownersOf(ev({ id: '4', title: 'x', calendarKey: 'unknown', sourceUserId: 'l' }), byKey)).toEqual(['l'])
  })

  it('merges the same event from two calendars and remembers both', () => {
    const merged = withOwners([ev({ id: '1', title: 'Offsite', calendarKey: 'a_work' }), ev({ id: '2', title: 'Offsite', calendarKey: 'l_fam', sourceUserId: 'l' })], byKey)
    expect(merged).toHaveLength(1)
    expect(merged[0].calendarKeys).toEqual(['a_work', 'l_fam'])
    expect(merged[0].ownerIds).toEqual(['a', 'l'])
  })
})

describe('applyFilter', () => {
  const events = [
    ev({ id: 'w', title: 'Standup', calendarKey: 'a_work' }),
    ev({ id: 'f', title: 'Dinner', calendarKey: 'l_fam', sourceUserId: 'l' }),
    ev({ id: 'm', title: 'Dentist', source: 'manual', memberIds: ['l'] }),
  ]
  it('hides switched-off calendars', () => {
    expect(applyFilter(events, { people: [], calendars: ['a_work'] }, byKey).map((e) => e.id)).toEqual(['f', 'm'])
  })
  it('hides a person only when nobody else on the event is shown', () => {
    // Dinner is on the shared Family calendar (Lydia + Andrew), so hiding Lydia keeps it.
    expect(applyFilter(events, { people: ['l'], calendars: [] }, byKey).map((e) => e.id)).toEqual(['w', 'f'])
  })
})

describe('EventChip colors', () => {
  const chip = (settings: object) =>
    render(
      <StaticSettings settings={settings}>
        <EventChip event={{ ...ev({ id: 'w', title: 'Standup', calendarKey: 'a_work' }), ownerIds: ['a'], calendarKeys: ['a_work'] }} members={new Map(members.map((m) => [m.id, m]))} calendars={byKey} now={new Date('2026-09-29T12:00:00Z')} today="2026-09-29" />
      </StaticSettings>,
    )

  it('uses the calendar color by default, keeping the person’s initial', () => {
    const { container } = chip({})
    expect((container.querySelector('.event') as HTMLElement).style.getPropertyValue('--owner-bar')).toBe('#7e22ce')
    expect(screen.getByLabelText('For Andrew')).toBeInTheDocument()
    expect(screen.getByText('(calendar: Work)', { exact: false })).toBeInTheDocument()
  })

  it('can color by person instead', () => {
    const { container } = chip({ colorEventsBy: 'person' })
    expect((container.querySelector('.event') as HTMLElement).style.getPropertyValue('--owner-bar')).toBe('#15803d')
  })
})

describe('CalendarFilter', () => {
  it('lists people and shown calendars and reports changes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CalendarFilter members={members} calendars={[WORK, FAMILY, cal({ key: 'a_hidden', ownerId: 'a', name: 'Hidden', enabled: false })]} hidden={{ people: [], calendars: [] }} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Filter' }))
    const menu = screen.getByRole('dialog', { name: 'Filter calendar' })
    expect(within(menu).queryByText('Hidden')).not.toBeInTheDocument()
    await user.click(within(menu).getByRole('checkbox', { name: /Work/ }))
    expect(onChange).toHaveBeenCalledWith({ people: [], calendars: ['a_work'] })
    await user.click(within(within(menu).getByRole('group', { name: 'People' })).getByRole('checkbox', { name: /Lydia/ }))
    expect(onChange).toHaveBeenLastCalledWith({ people: ['l'], calendars: [] })
  })

  it('shows how many things are hidden', () => {
    render(<CalendarFilter members={members} calendars={[WORK]} hidden={{ people: ['l'], calendars: ['a_work'] }} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Filter · 2 hidden' })).toBeInTheDocument()
  })
})

describe('MyCalendars', () => {
  it('lists only your calendars and lets you show/hide, recolor, rename, and share them', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MyCalendars userId="a" members={members} calendars={[cal({ key: 'a_main', ownerId: 'a', name: 'Andrew', primary: true }), WORK, FAMILY]} onChange={onChange} />)
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    await user.click(screen.getByRole('switch', { name: 'Show Work' }))
    expect(onChange).toHaveBeenCalledWith('a_work', { enabled: false })

    await user.click(screen.getByRole('button', { name: 'Change color and details for Work' }))
    await user.click(screen.getByRole('radio', { name: 'Teal' }))
    expect(onChange).toHaveBeenLastCalledWith('a_work', { color: '#0f766e' })
    await user.click(screen.getByRole('button', { name: "Use Google's color" }))
    expect(onChange).toHaveBeenLastCalledWith('a_work', { color: '#039be5' })

    await user.type(screen.getByLabelText('Nickname'), 'Office')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith('a_work', { alias: 'Office' })

    await user.click(within(screen.getByRole('group', { name: 'People for Work' })).getByRole('button', { name: /Lydia/ }))
    expect(onChange).toHaveBeenLastCalledWith('a_work', { memberIds: ['a', 'l'] })
  })
})
