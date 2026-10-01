import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Chore, Member } from '../../types'
import { ChoreBoard } from './ChoreBoard'
import { toRepeat } from './schedule'

const TODAY = '2026-09-28' // Monday
const NOW = new Date('2026-09-28T19:31:00')
const members: Member[] = [
  { id: 'l', displayName: 'Lydia', email: 'l@x.com', color: '#c2410c' },
  { id: 'a', displayName: 'Andrew Jacon', email: 'a@x.com', color: '#15803d' },
]
const chores: Chore[] = [
  { id: 'plants', title: 'Water the plants', assigneeId: 'l', dueDate: '2026-09-21', dueTime: '10:00', done: false, points: 2, repeat: { freq: 'daily', interval: 1 } },
  { id: 'trash', title: 'Take out the trash', assigneeId: 'a', dueDate: '2026-09-22', done: false, points: 1, repeat: { freq: 'weekly', interval: 1, days: [2] } },
  { id: 'dishes', title: 'Unload dishwasher', assigneeId: 'a', dueDate: TODAY, done: true, points: 1 },
  { id: 'garage', title: 'Sweep the garage', assigneeId: null, dueDate: TODAY, done: false, points: 5 },
]

afterEach(() => vi.restoreAllMocks())

function setup(list = chores) {
  const props = { chores: list, members, stars: new Map([['l', 12]]), today: TODAY, now: NOW, weekStartsOn: 0, onToggle: vi.fn(), onAdd: vi.fn(), onDelete: vi.fn() }
  render(<ChoreBoard {...props} />)
  return { props, user: userEvent.setup() }
}

describe('ChoreBoard day view', () => {
  it('has a column per person plus Up for Grabs, with progress and stars', () => {
    setup()
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Lydia', 'Andrew', 'Up for Grabs'])
    const lydia = screen.getByRole('article', { name: 'Lydia' })
    expect(within(lydia).getByLabelText('0 of 1 done')).toBeInTheDocument()
    expect(within(lydia).getByLabelText('12 stars')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Andrew' })).getByLabelText('1 of 2 done')).toBeInTheDocument()
  })

  it('shows repeat icons and how late things are, like Skylight', () => {
    setup()
    const lydia = screen.getByRole('article', { name: 'Lydia' })
    expect(within(lydia).getByText('9 hours late')).toBeInTheDocument()
    expect(within(lydia).getByLabelText('Every day')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Andrew' })).getByText('6 days late')).toBeInTheDocument()
  })

  it('checks off a person’s chore occurrence directly', async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Mark done: Water the plants' }))
    expect(props.onToggle).toHaveBeenCalledWith(expect.objectContaining({ date: TODAY, chore: chores[0] }), true, null)
    await user.click(screen.getByRole('button', { name: 'Undo: Unload dishwasher' }))
    expect(props.onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ chore: chores[2] }), false, null)
  })

  it('asks who did an Up for Grabs chore, so they get the stars', async () => {
    const { props, user } = setup()
    const grabs = screen.getByRole('article', { name: 'Up for Grabs' })
    await user.click(within(grabs).getByRole('button', { name: 'Mark done: Sweep the garage' }))
    expect(props.onToggle).not.toHaveBeenCalled()
    await user.click(within(within(grabs).getByRole('group', { name: 'Who did it?' })).getByRole('button', { name: /Andrew/ }))
    expect(props.onToggle).toHaveBeenCalledWith(expect.objectContaining({ chore: chores[3] }), true, 'a')
  })

  it('pages between days', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Next day' }))
    // Tomorrow: plants repeat, trash is not due (Tuesdays... tomorrow is Tuesday, so it is), dishes/garage are not.
    expect(screen.getByRole('button', { name: 'Mark done: Water the plants' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo: Unload dishwasher' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByRole('button', { name: 'Undo: Unload dishwasher' })).toBeInTheDocument()
  })
})

describe('ChoreBoard week view', () => {
  it('lays chores out by person and day', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Week' }))
    const table = screen.getByRole('table', { name: 'Chores this week' })
    expect(within(table).getAllByRole('button', { name: /Water the plants/ })).toHaveLength(7)
    expect(within(table).getByRole('button', { name: /Take out the trash, Tuesday/ })).toBeInTheDocument()
  })
})

describe('adding chores', () => {
  it('builds repeat rules from the menu', () => {
    expect(toRepeat('none', [1])).toBeNull()
    expect(toRepeat('weekdays', [])).toEqual({ freq: 'weekly', interval: 1, days: [1, 2, 3, 4, 5] })
    expect(toRepeat('biweekly', [3, 1])).toEqual({ freq: 'weekly', interval: 2, days: [1, 3] })
  })

  it('adds a weekly chore on chosen days', async () => {
    const { props, user } = setup([])
    // The toolbar button (the empty Up for Grabs column has its own "Add chore" link too).
    await user.click(screen.getAllByRole('button', { name: 'Add chore' })[0])
    await user.type(screen.getByLabelText('Chore'), 'Take out recycling')
    await user.selectOptions(screen.getByLabelText('Who'), 'Andrew Jacon')
    await user.selectOptions(screen.getByLabelText('Repeat'), 'Every week')
    await user.click(screen.getByRole('button', { name: 'Thursday' }))
    // Submit: the form's own "Add chore" button.
    await user.click(screen.getAllByRole('button', { name: 'Add chore' }).find((b) => b.closest('form'))!)
    expect(props.onAdd).toHaveBeenCalledWith({ title: 'Take out recycling', assigneeId: 'a', dueDate: TODAY, points: 1, repeat: { freq: 'weekly', interval: 1, days: [1, 4] } })
  })

  it('offers "Add chore" from an empty column, pre-filled for that person', async () => {
    const { user } = setup([])
    await user.click(within(screen.getByRole('article', { name: 'Lydia' })).getByRole('button', { name: 'Add chore for Lydia' }))
    expect(screen.getByLabelText('Who')).toHaveDisplayValue('Lydia')
  })
})
