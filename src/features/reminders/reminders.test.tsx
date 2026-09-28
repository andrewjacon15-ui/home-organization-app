import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, Chore, Member } from '../../types'
import { ReminderSettings } from '../settings/ReminderSettings'
import { StaticSettings } from '../settings/SettingsContext'
import { ReminderToasts } from './ReminderCenter'
import { choreDueAt, remindersBetween, type ReminderSettings as RS } from './reminders'

const local = (s: string) => new Date(s)
const members: Member[] = [
  { id: 'a', displayName: 'Andrew', email: 'a@x.com', color: '#e76f51' },
  { id: 'b', displayName: 'Lydia', email: 'l@x.com', color: '#2a9d8f' },
]
const ev = (over: Partial<CalendarEvent> & Pick<CalendarEvent, 'id' | 'title' | 'start'>): CalendarEvent => ({
  source: 'google',
  sourceUserId: 'a',
  end: new Date(over.start.getTime() + 3_600_000),
  allDay: false,
  ...over,
})
const s: RS = { remindAtStart: false, remindBeforeEnabled: true, remindBeforeMinutes: 30, remindChoresDue: false }

const soccer = ev({ id: 'soccer', title: 'Soccer', start: local('2026-10-01T17:00') })

describe('remindersBetween', () => {
  it('fires 30 minutes before by default, only inside the window', () => {
    const r = remindersBetween([soccer], [], s, local('2026-10-01T16:29'), local('2026-10-01T16:30'))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ title: 'Soccer', kind: 'event', at: local('2026-10-01T16:30'), ownerIds: ['a'] })
    expect(r[0].detail).toMatch(/^In 30 min · 5:00/)
    expect(remindersBetween([soccer], [], s, local('2026-10-01T16:30'), local('2026-10-01T16:31'))).toHaveLength(0)
  })

  it('uses the configured lead time and can also fire at the start', () => {
    const r = remindersBetween([soccer], [], { ...s, remindBeforeMinutes: 60, remindAtStart: true }, local('2026-10-01T15:00'), local('2026-10-01T17:00'))
    expect(r.map((x) => x.detail.split(' ·')[0])).toEqual(['In 1 hr', 'Starting now'])
    expect(new Set(r.map((x) => x.key)).size).toBe(2)
  })

  it('stays quiet when both event reminders are off, and for all-day events', () => {
    const allDay = ev({ id: 'trip', title: 'Trip', start: local('2026-10-01T00:00'), allDay: true, startDate: '2026-10-01', endDate: '2026-10-02' })
    expect(remindersBetween([soccer, allDay], [], { ...s, remindBeforeEnabled: false }, local('2026-10-01T00:00'), local('2026-10-02T00:00'))).toEqual([])
    expect(remindersBetween([allDay], [], s, local('2026-09-30T00:00'), local('2026-10-02T00:00'))).toEqual([])
  })

  it('reminds once for a Google event shared by two people', () => {
    const lydias = { ...soccer, id: 'soccer-l', sourceUserId: 'b' }
    const r = remindersBetween([soccer, lydias], [], s, local('2026-10-01T16:00'), local('2026-10-01T17:00'))
    expect(r).toHaveLength(1)
    expect(r[0].ownerIds).toEqual(['a', 'b'])
  })

  it('reminds for undone chores with a due time when turned on', () => {
    const chores: Chore[] = [
      { id: 'c1', title: 'Feed dog', assigneeId: 'b', dueDate: '2026-10-01', dueTime: '07:30', done: false, points: 1 },
      { id: 'c2', title: 'Done already', assigneeId: 'b', dueDate: '2026-10-01', dueTime: '07:30', done: true, points: 1 },
      { id: 'c3', title: 'No time', assigneeId: 'b', dueDate: '2026-10-01', done: false, points: 1 },
    ]
    expect(choreDueAt(chores[0])).toEqual(local('2026-10-01T07:30'))
    const window = [local('2026-10-01T07:00'), local('2026-10-01T08:00')] as const
    expect(remindersBetween([], chores, s, ...window)).toEqual([])
    const r = remindersBetween([], chores, { ...s, remindChoresDue: true }, ...window)
    expect(r.map((x) => x.title)).toEqual(['Feed dog'])
    expect(r[0].ownerIds).toEqual(['b'])
  })
})

describe('ReminderToasts', () => {
  it('shows who a reminder is for and dismisses', async () => {
    const onDismiss = vi.fn()
    render(
      <ReminderToasts
        alerts={[{ key: 'k', at: local('2026-10-01T16:30'), kind: 'event', title: 'Soccer', detail: 'In 30 min · 5:00 PM', ownerIds: ['a', 'b'] }]}
        members={members}
        onDismiss={onDismiss}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Soccer')
    expect(screen.getByRole('alert')).toHaveTextContent('Andrew, Lydia')
    await userEvent.click(screen.getByLabelText('Dismiss reminder for Soccer'))
    expect(onDismiss).toHaveBeenCalledWith('k')
  })
})

describe('ReminderSettings', () => {
  it('matches the Skylight defaults and saves changes', async () => {
    const update = vi.fn(async () => undefined)
    const chime = vi.fn()
    const user = userEvent.setup()
    render(
      <StaticSettings update={update}>
        <ReminderSettings chime={chime} />
      </StaticSettings>,
    )
    expect(screen.getByRole('switch', { name: 'At time of event' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Before event' })).toBeChecked()
    expect(screen.getByLabelText('How long before')).toHaveDisplayValue('30 minutes')
    expect(screen.getByRole('switch', { name: /Chores when due/ })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Reminder sound' })).toBeChecked()

    await user.selectOptions(screen.getByLabelText('How long before'), '1 hour')
    expect(update).toHaveBeenLastCalledWith({ remindBeforeMinutes: 60 })
    await user.click(screen.getByRole('switch', { name: /Chores when due/ }))
    expect(update).toHaveBeenLastCalledWith({ remindChoresDue: true })
    await user.click(screen.getByRole('button', { name: 'Play test sound' }))
    expect(chime).toHaveBeenCalled()
  })
})
