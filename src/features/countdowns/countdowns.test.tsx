import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CountdownPanel } from './Countdowns'
import { daysUntil, untilLabel, upcoming } from './countdownsApi'

const TODAY = '2026-10-03'

describe('countdown math', () => {
  it('counts whole days, across a month and a clock change', () => {
    expect(daysUntil('2026-10-03', TODAY)).toBe(0)
    expect(daysUntil('2026-10-04', TODAY)).toBe(1)
    expect(daysUntil('2026-11-05', TODAY)).toBe(33)
    expect(daysUntil('2026-10-01', TODAY)).toBe(-2)
  })

  it('says it simply', () => {
    expect(untilLabel(0)).toEqual({ count: 'Today', unit: '' })
    expect(untilLabel(1)).toEqual({ count: '1', unit: 'day' })
    expect(untilLabel(12)).toEqual({ count: '12', unit: 'days' })
    expect(untilLabel(70)).toEqual({ count: '10', unit: 'weeks' })
    expect(untilLabel(200)).toEqual({ count: '7', unit: 'months' })
  })

  it('shows upcoming ones, soonest first, and hides past ones', () => {
    const list = [
      { id: 'b', title: 'Thanksgiving', date: '2026-11-26' },
      { id: 'p', title: 'Last week', date: '2026-09-30' },
      { id: 'a', title: 'Beach trip', date: '2026-10-15' },
    ]
    expect(upcoming(list, TODAY).map((c) => c.id)).toEqual(['a', 'b'])
  })
})

describe('CountdownPanel', () => {
  it('shows each countdown and adds and removes them', async () => {
    const onAdd = vi.fn()
    const onRemove = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(
      <CountdownPanel
        countdowns={[
          { id: 'a', title: 'Beach trip', date: '2026-10-15' },
          { id: 't', title: 'Grandma visits', date: TODAY },
        ]}
        today={TODAY}
        onAdd={onAdd}
        onRemove={onRemove}
      />,
    )
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Today')
    expect(items[0]).toHaveTextContent('Grandma visits')
    expect(items[1]).toHaveAccessibleName(/Beach trip: 12 days/)

    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(screen.getByLabelText('What are you counting down to?'), 'Last day of school')
    await user.type(screen.getByLabelText('Date'), '2027-05-28')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith('Last day of school', '2027-05-28')

    await user.click(screen.getByRole('button', { name: 'Remove Beach trip' }))
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('invites you to add one when there are none', () => {
    render(<CountdownPanel countdowns={[]} today={TODAY} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/Nothing to count down to yet/)).toBeInTheDocument()
  })
})
