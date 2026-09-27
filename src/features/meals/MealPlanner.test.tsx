import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { daysBetween, startOfWeek } from '../../lib/dates'
import type { MealPlan } from '../../types'
import { MealPlanner } from './MealPlanner'

// 2026-09-27 is a Sunday.
const WEEK = '2026-09-27'
const TODAY = '2026-09-29'

const plans: Record<string, MealPlan> = {
  '2026-09-29': { breakfast: 'Oatmeal', lunch: '', dinner: 'Tacos', notes: 'Buy limes' },
}

function setup(overrides: Partial<Parameters<typeof MealPlanner>[0]> = {}) {
  const props = {
    weekStart: WEEK,
    currentWeekStart: WEEK,
    today: TODAY,
    plans,
    onSave: vi.fn(),
    onWeekChange: vi.fn(),
    ...overrides,
  }
  const view = render(<MealPlanner {...props} />)
  return { props, view, user: userEvent.setup() }
}

describe('startOfWeek', () => {
  it('counts days across a DST change', () => {
    expect(daysBetween('2026-10-25', '2026-11-08')).toBe(14)
    expect(daysBetween('2026-10-04', '2026-09-27')).toBe(-7)
  })

  it('finds the Sunday (or Monday) on or before a date', () => {
    expect(startOfWeek('2026-09-27')).toBe('2026-09-27')
    expect(startOfWeek('2026-10-03')).toBe('2026-09-27')
    expect(startOfWeek('2026-10-03', 1)).toBe('2026-09-28')
    expect(startOfWeek('2026-09-27', 1)).toBe('2026-09-21')
  })
})

describe('MealPlanner', () => {
  it('shows seven days with existing plans and marks today', () => {
    setup()
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    const today = screen.getByRole('listitem', { current: 'date' })
    expect(within(today).getByText('Today')).toBeInTheDocument()
    expect(within(today).getByLabelText('Tuesday dinner')).toHaveValue('Tacos')
    expect(within(today).getByLabelText('Tuesday notes')).toHaveValue('Buy limes')
    expect(screen.getByLabelText('Wednesday dinner')).toHaveValue('')
  })

  it('saves the whole day on blur, keeping other meals', async () => {
    const { props, user } = setup()
    await user.type(screen.getByLabelText('Tuesday lunch'), 'Leftovers ')
    expect(props.onSave).not.toHaveBeenCalled()
    await user.tab()
    expect(props.onSave).toHaveBeenCalledWith('2026-09-29', { breakfast: 'Oatmeal', lunch: 'Leftovers', dinner: 'Tacos', notes: 'Buy limes' })
  })

  it('saves on Enter for a new day', async () => {
    const { props, user } = setup()
    await user.type(screen.getByLabelText('Friday dinner'), 'Pizza night{Enter}')
    expect(props.onSave).toHaveBeenCalledWith('2026-10-02', { breakfast: '', lunch: '', dinner: 'Pizza night', notes: '' })
  })

  it("doesn't save when nothing changed", async () => {
    const { props, user } = setup()
    await user.click(screen.getByLabelText('Tuesday dinner'))
    await user.tab()
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('picks up edits from another device', () => {
    const { props, view } = setup()
    view.rerender(<MealPlanner {...props} plans={{ '2026-09-29': { ...plans['2026-09-29'], dinner: 'Curry' } }} />)
    expect(screen.getByLabelText('Tuesday dinner')).toHaveValue('Curry')
  })

  it('navigates weeks and offers a way back to this week', async () => {
    const { props, user } = setup()
    expect(screen.queryByRole('button', { name: 'This week' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(props.onWeekChange).toHaveBeenCalledWith('2026-10-04')
    await user.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(props.onWeekChange).toHaveBeenCalledWith('2026-09-20')
  })

  it('shows "This week" when viewing another week', async () => {
    const { props, user } = setup({ weekStart: '2026-10-04' })
    await user.click(screen.getByRole('button', { name: 'This week' }))
    expect(props.onWeekChange).toHaveBeenCalledWith(WEEK)
  })
})
