import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MealGroceries } from './MealGroceries'
import { plannedMeals } from './upcomingMeals'

const TODAY = '2026-10-03'
const plans = {
  '2026-10-03': { breakfast: '', lunch: 'Leftovers', dinner: 'Chicken tacos', notes: 'Buy limes' },
  '2026-10-05': { breakfast: 'Pancakes', lunch: '', dinner: 'Tomato soup', notes: '' },
  '2026-10-20': { breakfast: '', lunch: '', dinner: 'Too far out', notes: '' },
}
const recipeIds: Record<string, string> = { 'chicken tacos': 't', pancakes: 'p', 'tomato soup': 's' }
const recipeFor = (text: string) => recipeIds[text.toLowerCase()] ?? null

describe('plannedMeals', () => {
  it('lists the planned meals in the window in order, matched to saved recipes', () => {
    expect(plannedMeals(plans, TODAY, 7, recipeFor).map((m) => [m.date, m.slot, m.text, m.recipeId])).toEqual([
      ['2026-10-03', 'lunch', 'Leftovers', null],
      ['2026-10-03', 'dinner', 'Chicken tacos', 't'],
      ['2026-10-05', 'breakfast', 'Pancakes', 'p'],
      ['2026-10-05', 'dinner', 'Tomato soup', 's'],
    ])
    expect(plannedMeals(plans, TODAY, 3, recipeFor)).toHaveLength(4)
  })
})

describe('MealGroceries', () => {
  it('ticks every meal with a recipe, lets you untick some, and reports what was added', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn(async () => ({ added: 9, staples: 2, onList: 1 }))
    const onDays = vi.fn()
    render(<MealGroceries today={TODAY} days={7} onDays={onDays} meals={plannedMeals(plans, TODAY, 7, recipeFor)} onAdd={onAdd} onClose={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: /Leftovers/ })).toBeDisabled()
    expect(screen.getByText(/no saved recipe/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Pancakes/ }))
    await user.click(screen.getByRole('button', { name: 'Add ingredients for 2 meals' }))
    expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ text: 'Chicken tacos' }), expect.objectContaining({ text: 'Tomato soup' })])
    expect(await screen.findByRole('status')).toHaveTextContent('Added 9 items to the grocery list. Skipped 2 pantry staples and 1 already on the list.')
    await user.click(screen.getByRole('button', { name: '14 days' }))
    expect(onDays).toHaveBeenCalledWith(14)
  })

  it('says when nothing is planned', () => {
    render(<MealGroceries today={TODAY} days={3} onDays={vi.fn()} meals={[]} onAdd={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Nothing planned in the next 3 days/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add ingredients for 0 meals' })).toBeDisabled()
  })
})
