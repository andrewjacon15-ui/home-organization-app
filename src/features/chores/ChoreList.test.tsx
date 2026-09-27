import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Chore, Member } from '../../types'
import { ChoreList } from './ChoreList'

const TODAY = '2026-10-05'

const members: Member[] = [
  { id: 'a', displayName: 'Andrew Smith', email: 'a@example.com', color: '#e76f51' },
  { id: 'b', displayName: 'Bea Smith', email: 'b@example.com', color: '#2a9d8f' },
]

const chores: Chore[] = [
  { id: '1', title: 'Take out trash', assigneeId: 'a', dueDate: '2026-10-06', done: false, points: 2 },
  { id: '2', title: 'Feed the cat', assigneeId: 'b', dueDate: '2026-10-04', done: false, points: 1 },
  { id: '3', title: 'Vacuum', assigneeId: 'b', dueDate: TODAY, done: true, points: 5 },
  { id: '4', title: 'Water plants', assigneeId: null, dueDate: null, done: false, points: 0 },
]

function setup(overrides: Partial<Parameters<typeof ChoreList>[0]> = {}) {
  const props = {
    chores,
    members,
    today: TODAY,
    onAdd: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
  render(<ChoreList {...props} />)
  return { props, user: userEvent.setup() }
}

const todoTitles = () =>
  within(screen.getByRole('list', { name: 'To do' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.chore__title')?.textContent)

describe('ChoreList', () => {
  it('lists open chores soonest-first with undated chores last, and hides done ones in a section', () => {
    setup()
    expect(todoTitles()).toEqual(['Feed the cat', 'Take out trash', 'Water plants'])
    expect(within(screen.getByRole('list', { name: 'Done' })).getByText('Vacuum')).toBeInTheDocument()
    expect(screen.getByText('Done (1)')).toBeInTheDocument()
  })

  it('flags overdue chores and labels relative due dates', () => {
    setup()
    expect(screen.getByText('Overdue · Yesterday')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
  })

  it('toggles and deletes chores', async () => {
    const { props, user } = setup()
    await user.click(screen.getByLabelText('Mark "Take out trash" done'))
    expect(props.onToggle).toHaveBeenCalledWith(chores[0])
    await user.click(screen.getByLabelText('Delete "Feed the cat"'))
    expect(props.onDelete).toHaveBeenCalledWith(chores[1])
  })

  it('adds a chore with the chosen assignee, date, and points', async () => {
    const { props, user } = setup()
    const add = screen.getByRole('button', { name: 'Add' })
    expect(add).toBeDisabled()

    await user.type(screen.getByLabelText('Chore'), '  Mow lawn  ')
    await user.selectOptions(screen.getByLabelText('Assign to'), 'b')
    await user.clear(screen.getByLabelText('Points'))
    await user.type(screen.getByLabelText('Points'), '4')
    await user.click(add)

    expect(props.onAdd).toHaveBeenCalledWith({ title: 'Mow lawn', assigneeId: 'b', dueDate: TODAY, points: 4 })
    expect(screen.getByLabelText('Chore')).toHaveValue('')
  })

  it('adds an unassigned, undated chore', async () => {
    const { props, user } = setup()
    await user.type(screen.getByLabelText('Chore'), 'Sweep')
    await user.clear(screen.getByLabelText('Due date'))
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(props.onAdd).toHaveBeenCalledWith({ title: 'Sweep', assigneeId: null, dueDate: null, points: 1 })
  })

  it('filters by person and shows points earned from done chores', async () => {
    const { user } = setup()
    const bea = screen.getByRole('button', { name: /Bea/ })
    expect(within(bea).getByLabelText('5 points')).toBeInTheDocument()

    await user.click(bea)
    expect(todoTitles()).toEqual(['Feed the cat'])

    await user.click(screen.getByRole('button', { name: 'Everyone' }))
    expect(todoTitles()).toHaveLength(3)
  })

  it('shows an empty state', () => {
    setup({ chores: [] })
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument()
  })
})
