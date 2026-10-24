import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MealGroceries } from './MealGroceries'
import { groceryMessage, plannedMeals } from './upcomingMeals'

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
  it('ticks every meal with a recipe, shows the combined list to look over, and adds what stays ticked', async () => {
    const user = userEvent.setup()
    const plan = {
      lines: ['2 lb ground beef', '1 onion', '6 tortillas'],
      details: [
        { line: '2 lb ground beef', sources: ['2026-10-03:dinner', '2026-10-05:dinner'] },
        { line: '1 onion', sources: ['2026-10-05:dinner'] },
        { line: '6 tortillas', sources: ['2026-10-03:dinner'] },
      ],
      staples: ['salt', 'oil'],
      onList: ['lime'],
    }
    const labels = { '2026-10-03:dinner': 'Sat dinner: Chicken tacos', '2026-10-05:dinner': 'Mon dinner: Tomato soup' }
    const onReview = vi.fn(async () => ({ plan, labels }))
    const onAdd = vi.fn(async () => undefined)
    const onDays = vi.fn()
    render(<MealGroceries today={TODAY} days={7} onDays={onDays} meals={plannedMeals(plans, TODAY, 7, recipeFor)} defaultPeople={4} onReview={onReview} onAdd={onAdd} onClose={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: /Leftovers/ })).toBeDisabled()
    expect(screen.getByText(/no saved recipe/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '14 days' }))
    expect(onDays).toHaveBeenCalledWith(14)
    // Every meal with a recipe starts ticked; the select-all box unticks and reticks them.
    await user.click(screen.getByRole('checkbox', { name: 'Every meal with a recipe' }))
    expect(screen.getByRole('button', { name: 'See the groceries for 0 meals' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Every meal with a recipe' }))
    await user.click(screen.getByRole('checkbox', { name: /Pancakes/ }))
    await user.click(screen.getByRole('button', { name: 'See the groceries for 2 meals' }))
    expect(onReview).toHaveBeenCalledWith([expect.objectContaining({ text: 'Chicken tacos' }), expect.objectContaining({ text: 'Tomato soup' })], 'plan')
    // Each line says which meals it's for; untick one you already have.
    expect(await screen.findByText('Sat dinner: Chicken tacos · Mon dinner: Tomato soup')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /1 onion/ }))
    expect(screen.getByRole('checkbox', { name: '2 of 3 ticked' })).toHaveProperty('indeterminate', true)
    // The select-all box ticks everything again, or nothing.
    await user.click(screen.getByRole('checkbox', { name: '2 of 3 ticked' }))
    expect(screen.getByRole('button', { name: 'Add 3 to the grocery list' })).toBeEnabled()
    await user.click(screen.getByRole('checkbox', { name: 'Everything ticked' }))
    expect(screen.getByRole('button', { name: 'Add 0 to the grocery list' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Nothing ticked' }))
    await user.click(screen.getByRole('checkbox', { name: /1 onion/ }))
    await user.click(screen.getByRole('button', { name: 'Add 2 to the grocery list' }))
    // Each line goes on the list with the meals it's for, so clearing those meals can take it off.
    expect(onAdd).toHaveBeenCalledWith([
      { text: '2 lb ground beef', meals: ['2026-10-03:dinner', '2026-10-05:dinner'] },
      { text: '6 tortillas', meals: ['2026-10-03:dinner'] },
    ])
    expect(await screen.findByRole('status')).toHaveTextContent('Added 2 items to the grocery list. Skipped 2 pantry staples and 1 already on the list.')
  })

  it('says when nothing is planned', () => {
    render(<MealGroceries today={TODAY} days={3} onDays={vi.fn()} meals={[]} defaultPeople={null} onReview={vi.fn()} onAdd={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Nothing planned in the next 3 days/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'See the groceries for 0 meals' })).toBeDisabled()
  })
})

describe('groceryMessage', () => {
  it('says what was added and what was left off', () => {
    expect(groceryMessage({ added: 1, staples: 0, onList: 0 })).toBe('Added 1 item to the grocery list.')
    expect(groceryMessage({ added: 4, staples: 1, onList: 2 })).toBe('Added 4 items to the grocery list. Skipped 1 pantry staple and 2 already on the list.')
    expect(groceryMessage({ added: 0, staples: 0, onList: 3 })).toBe('Nothing new for the grocery list. Skipped 3 already on the list.')
  })
})
