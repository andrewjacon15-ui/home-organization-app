import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, Chore, Member } from '../../types'
import type { FamilyList, ListItem } from '../lists/listsApi'
import { HomeView } from './HomeView'

const TODAY = '2026-09-28'
const members: Member[] = [
  { id: 'l', displayName: 'Lydia', email: 'l@x.com', color: '#c2410c' },
  { id: 'a', displayName: 'Andrew Jacon', email: 'a@x.com', color: '#15803d' },
]
const local = (s: string) => new Date(s)
const ev = (id: string, title: string, start: string, end: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, title, source: 'google', sourceUserId: 'a', start: local(start), end: local(end), allDay: false, ...over })

const events = [
  ev('1', 'Flight to RDU', '2026-09-28T08:41', '2026-09-28T10:04', { sourceUserId: 'l' }),
  ev('2', 'Oil change', '2026-10-02T15:30', '2026-10-02T16:30'),
  ev('3', 'Dentist', '2026-10-06T09:00', '2026-10-06T10:00'),
  ev('4', 'Soccer', '2026-10-08T17:00', '2026-10-08T18:00'),
]
const chores: Chore[] = [
  { id: 'c1', title: 'Water the plants', assigneeId: 'l', dueDate: TODAY, done: false, points: 1 },
  { id: 'c2', title: 'Take out the trash', assigneeId: 'a', dueDate: TODAY, done: true, points: 1 },
  { id: 'c3', title: 'Sweep garage', assigneeId: null, dueDate: TODAY, done: false, points: 0 },
]
const grocery: FamilyList = { id: 'grocery', title: 'Grocery List', kind: 'grocery', sections: false, order: 0 }
const todo: FamilyList = { id: 'todo', title: 'To-Do List', kind: 'todo', sections: true, order: 1 }
const extra: FamilyList = { id: 'x', title: 'Packing', kind: 'custom', sections: false, order: 2 }
const items: Record<string, ListItem[]> = {
  grocery: [
    { id: 'i1', text: 'Milk', done: false, memberId: null, order: 1 },
    { id: 'i2', text: 'Eggs', done: true, memberId: null, order: 2 },
  ],
  todo: [{ id: 't1', text: 'Reseal shower', done: false, memberId: 'a', order: 1 }],
}

function setup(panels?: ('lists' | 'tasks' | 'calendar')[], calendarDays: 1 | 3 | 7 = 7) {
  const props = {
    panels,
    calendarDays,
    onCalendarDays: vi.fn(),
    today: TODAY,
    now: local('2026-09-28T07:00'),
    start: calendarDays === 7 ? '2026-09-27' : TODAY,
    events,
    calendars: [],
    members,
    chores,
    lists: [grocery, todo, extra],
    items,
    onNavigate: vi.fn(),
    onToggleChore: vi.fn(),
    onDeleteChore: vi.fn(),
    onAddItem: vi.fn(),
    onToggleItem: vi.fn(),
  }
  render(<HomeView {...props} />)
  return { props, user: userEvent.setup() }
}

describe('HomeView', () => {
  it('stacks Countdowns, Lists, Tasks, then Calendar by default, and follows the Home screen setting', () => {
    setup()
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Countdowns', 'Lists', "Today's tasks", 'This week'])
  })

  it('shows only the chosen panels, in order', () => {
    setup(['calendar', 'lists'])
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['This week', 'Lists'])
  })

  it('explains an empty Home', () => {
    setup([])
    expect(screen.getByText(/Choose panels in Settings/)).toBeInTheDocument()
  })

  it('shows this week as day cells plus a Next Week summary', () => {
    setup()
    const cal = screen.getByRole('region', { name: 'This week' })
    expect(within(within(cal).getByLabelText(/Monday, September 28/)).getByText('Flight to RDU')).toBeInTheDocument()
    expect(within(within(cal).getByLabelText(/Friday, October 2/)).getByText('Oil change')).toBeInTheDocument()
    const next = within(cal).getByRole('button', { name: 'Next week' })
    expect(within(next).getByText('2 events')).toBeInTheDocument()
    expect(within(next).getByText(/Dentist/)).toBeInTheDocument()
  })

  it('shows 3 days from today with what is coming up after, and switches between 1, 3, and 7 days', async () => {
    const { props, user } = setup(['calendar'], 3)
    const cal = screen.getByRole('region', { name: 'Next 3 days' })
    expect(within(cal).getByLabelText(/Monday, September 28/)).toBeInTheDocument()
    expect(within(cal).getByLabelText(/Wednesday, September 30/)).toBeInTheDocument()
    expect(within(cal).queryByLabelText(/Thursday, October 1/)).not.toBeInTheDocument()
    const later = within(cal).getByRole('button', { name: 'Coming up' })
    expect(within(later).getByText('October 1 – 7')).toBeInTheDocument()
    expect(within(later).getByText('2 events')).toBeInTheDocument()
    expect(within(later).getByText(/Oil change/)).toBeInTheDocument()
    expect(within(cal).getByRole('button', { name: '3 days' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(cal).getByRole('button', { name: '1 day' }))
    expect(props.onCalendarDays).toHaveBeenCalledWith(1)
  })

  it('lists every event on a busy day (the day scrolls) instead of cutting it off', () => {
    const many = Array.from({ length: 12 }, (_, i) => ev(`b${i}`, `Meeting ${i + 1}`, `2026-09-28T${String(8 + (i % 10)).padStart(2, '0')}:00`, `2026-09-28T${String(9 + (i % 10)).padStart(2, '0')}:00`))
    render(<HomeView panels={['calendar']} calendarDays={1} start={TODAY} today={TODAY} now={local('2026-09-28T07:00')} events={many} calendars={[]} members={members} chores={[]} lists={[]} items={{}} onNavigate={vi.fn()} onToggleChore={vi.fn()} onDeleteChore={vi.fn()} onAddItem={vi.fn()} onToggleItem={vi.fn()} />)
    const day = screen.getByLabelText(/Monday, September 28/)
    expect(within(day).getAllByRole('listitem')).toHaveLength(12)
    expect(within(day).queryByText(/more$/)).not.toBeInTheDocument()
  })

  it("shows today's tasks by person, with Up for Grabs when there are any", async () => {
    const { props, user } = setup()
    const tasks = screen.getByRole('region', { name: "Today's tasks" })
    expect(within(tasks).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Lydia', 'Andrew', 'Up for Grabs'])
    expect(within(within(tasks).getByRole('article', { name: 'Andrew' })).getByLabelText('1 of 1 done')).toBeInTheDocument()
    await user.click(within(tasks).getByRole('button', { name: 'Mark done: Water the plants' }))
    expect(props.onToggleChore).toHaveBeenCalledWith(expect.objectContaining({ chore: chores[0] }), true, null)
  })

  it('previews the first two lists with quick add and check-off', async () => {
    const { props, user } = setup()
    const lists = screen.getByRole('region', { name: 'Lists' })
    expect(within(lists).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Grocery List', 'To-Do List'])
    expect(within(lists).queryByText('Eggs')).not.toBeInTheDocument()
    await user.type(within(lists).getByLabelText('Add to Grocery List'), 'Bread{Enter}')
    expect(props.onAddItem).toHaveBeenCalledWith(grocery, 'Bread')
    await user.click(within(lists).getByRole('checkbox', { name: 'Check off Milk' }))
    expect(props.onToggleItem).toHaveBeenCalledWith(grocery, items.grocery[0])
  })

  it('opens the full tab from each panel', async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Open Calendar' }))
    await user.click(screen.getByRole('button', { name: "Open Today's tasks" }))
    await user.click(screen.getByRole('button', { name: 'Open Lists' }))
    expect(props.onNavigate.mock.calls.map((c) => c[0])).toEqual(['calendar', 'chores', 'lists'])
  })
})
