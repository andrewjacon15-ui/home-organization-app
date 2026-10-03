import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Member, SyncedCalendar } from '../../types'
import { CalendarLinks } from './CalendarLinks'

const members: Member[] = [
  { id: 'a', displayName: 'Andrew', email: 'a@x.com', color: '#e76f51' },
  { id: 'b', displayName: 'Bea', email: 'b@x.com', color: '#2a9d8f' },
]

const link: SyncedCalendar = {
  key: 'ics_1',
  kind: 'ics',
  url: 'https://school.example.org/cal.ics',
  ownerId: 'b',
  calendarId: 'https://school.example.org/cal.ics',
  name: 'Lincoln Elementary',
  googleColor: '#0f766e',
  color: '#0f766e',
  enabled: true,
  primary: false,
  memberIds: ['a', 'b'],
  lastSyncAt: new Date('2026-10-03T15:00:00'),
  eventCount: 42,
}
const google: SyncedCalendar = { ...link, key: 'a_work', kind: undefined, url: undefined, name: 'Work', ownerId: 'a' }

function api(calendars: SyncedCalendar[] = [link, google]) {
  return {
    add: vi.fn(async () => ({ key: 'ics_2', name: 'Soccer', eventCount: 6 })),
    refresh: vi.fn(async () => ({ data: {} }) as never),
    remove: vi.fn(async () => ({ data: {} }) as never),
    update: vi.fn(async () => undefined),
    watch: vi.fn((_f: string, cb: (c: SyncedCalendar[]) => void) => {
      cb(calendars)
      return () => undefined
    }),
  }
}

describe('Calendar links', () => {
  it('lists only links, with their status, not Google calendars', () => {
    render(<CalendarLinks familyId="f" userId="a" members={members} api={api()} />)
    expect(screen.getByText('Lincoln Elementary')).toBeInTheDocument()
    expect(screen.getByText(/42 events · updated/)).toBeInTheDocument()
    expect(screen.queryByText('Work')).not.toBeInTheDocument()
  })

  it('adds a link for the chosen people and says what it found', async () => {
    const a = api()
    const user = userEvent.setup()
    render(<CalendarLinks familyId="f" userId="a" members={members} api={a} />)
    await user.type(screen.getByLabelText('Calendar link'), 'webcal://p52-caldav.icloud.com/published/2/abc')
    await user.click(screen.getAllByRole('button', { name: /Bea/ })[0])
    await user.click(screen.getByRole('button', { name: 'Add calendar' }))
    expect(a.add).toHaveBeenCalledWith('f', 'webcal://p52-caldav.icloud.com/published/2/abc', '', ['a', 'b'], expect.stringMatching(/^#[0-9A-F]{6}$/i))
    expect(await screen.findByRole('status')).toHaveTextContent('Added Soccer: 6 events')
  })

  it('shows why a link failed', async () => {
    const a = api()
    a.add.mockRejectedValueOnce(new Error('That link isn’t a calendar file (.ics).'))
    const user = userEvent.setup()
    render(<CalendarLinks familyId="f" userId="a" members={members} api={a} />)
    await user.type(screen.getByLabelText('Calendar link'), 'https://school.example.org')
    await user.click(screen.getByRole('button', { name: 'Add calendar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t a calendar file')
  })

  it('hides (and re-reads), updates, and removes a link', async () => {
    const a = api()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<CalendarLinks familyId="f" userId="a" members={members} api={a} />)
    await user.click(screen.getByRole('switch', { name: 'Show Lincoln Elementary' }))
    expect(a.update).toHaveBeenCalledWith('f', 'ics_1', { enabled: false })
    expect(a.refresh).toHaveBeenCalledWith('f', 'ics_1')
    await user.click(screen.getByRole('button', { name: 'Change color and details for Lincoln Elementary' }))
    await user.click(screen.getByRole('button', { name: 'Update now' }))
    expect(a.refresh).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(a.remove).toHaveBeenCalledWith('f', 'ics_1')
  })

  it('shows an error from the last update', () => {
    render(<CalendarLinks familyId="f" userId="a" members={members} api={api([{ ...link, error: 'The calendar link answered 404 (not found).' }])} />)
    expect(screen.getByText(/Couldn’t update .*404/)).toBeInTheDocument()
  })
})
