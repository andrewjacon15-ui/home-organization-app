import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MealPlanner } from '../meals/MealPlanner'
import { findRecipe, lines, type Recipe } from './recipesApi'
import { RecipeBook } from './RecipeBook'

const TODAY = '2026-09-29'
const tacos: Recipe = {
  id: 't',
  title: 'Chicken tacos',
  servings: 4,
  minutes: 30,
  ingredients: '1 lb chicken\n\n8 tortillas\n 1 lime ',
  steps: 'Season chicken.\nCook 12 minutes.\nServe.',
  url: 'https://example.com/tacos',
}
const soup: Recipe = { id: 's', title: 'Tomato soup', ingredients: 'tomatoes\nbasil', steps: 'Simmer.' }

afterEach(() => vi.restoreAllMocks())

function book(recipes = [tacos, soup]) {
  const props = { recipes, today: TODAY, onSave: vi.fn(async () => 'new-id'), onDelete: vi.fn(), onPlan: vi.fn() }
  render(<RecipeBook {...props} />)
  return { props, user: userEvent.setup() }
}

describe('recipe helpers', () => {
  it('splits lines, dropping blanks and spacing', () => {
    expect(lines(tacos.ingredients)).toEqual(['1 lb chicken', '8 tortillas', '1 lime'])
  })

  it('matches a meal to a recipe by title, ignoring case and spaces', () => {
    expect(findRecipe([tacos, soup], '  chicken TACOS ')).toBe(tacos)
    expect(findRecipe([tacos, soup], 'Leftovers')).toBeUndefined()
    expect(findRecipe([tacos], '')).toBeUndefined()
  })
})

describe('RecipeBook', () => {
  it('lists recipes, searches titles and ingredients, and opens one', async () => {
    const { user } = book()
    expect(within(screen.getByRole('list', { name: 'Recipes' })).getAllByRole('button')).toHaveLength(2)
    await user.type(screen.getByLabelText('Search recipes'), 'basil')
    expect(within(screen.getByRole('list', { name: 'Recipes' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Tomato soup'])
    await user.clear(screen.getByLabelText('Search recipes'))
    await user.click(screen.getByRole('button', { name: /Chicken tacos/ }))
    const recipe = screen.getByRole('article', { name: 'Chicken tacos' })
    expect(within(recipe).getAllByRole('checkbox')).toHaveLength(3)
    expect(within(within(recipe).getByRole('region', { name: 'Steps' })).getAllByRole('listitem')).toHaveLength(3)
    expect(within(recipe).getByText('30 minutes · Serves 4', { exact: false })).toBeInTheDocument()
    expect(within(recipe).getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://example.com/tacos')
  })

  it('checks off ingredients while cooking', async () => {
    const { user } = book()
    await user.click(screen.getByRole('button', { name: /Chicken tacos/ }))
    await user.click(screen.getByRole('checkbox', { name: '8 tortillas' }))
    expect(screen.getByRole('checkbox', { name: '8 tortillas' })).toBeChecked()
  })

  it('plans a recipe onto a day and meal', async () => {
    const { props, user } = book()
    await user.click(screen.getByRole('button', { name: /Chicken tacos/ }))
    await user.selectOptions(screen.getByLabelText('Meal'), 'Lunch')
    await user.click(screen.getByRole('button', { name: 'Add to meal plan' }))
    expect(props.onPlan).toHaveBeenCalledWith(tacos, TODAY, 'lunch')
    expect(screen.getByRole('status')).toHaveTextContent('Added as lunch')
  })

  it('creates a recipe, rejecting non-web links', async () => {
    const { props, user } = book([])
    expect(screen.getByText(/No recipes yet/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New recipe' }))
    await user.type(screen.getByLabelText('Title'), 'Pancakes')
    await user.type(screen.getByLabelText('Serves'), '3')
    await user.type(screen.getByLabelText(/^Ingredients/), 'flour{Enter}milk')
    await user.type(screen.getByLabelText('Source link'), 'ftp://x')
    expect(screen.getByRole('button', { name: 'Save recipe' })).toBeDisabled()
    await user.clear(screen.getByLabelText('Source link'))
    await user.click(screen.getByRole('button', { name: 'Save recipe' }))
    expect(props.onSave).toHaveBeenCalledWith({ title: 'Pancakes', ingredients: 'flour\nmilk', steps: '', servings: 3, minutes: null, url: null }, undefined)
  })

  it('edits and deletes (with confirm)', async () => {
    const { props, user } = book()
    await user.click(screen.getByRole('button', { name: /Tomato soup/ }))
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const title = screen.getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Tomato basil soup')
    await user.click(screen.getByRole('button', { name: 'Save recipe' }))
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tomato basil soup' }), 's')

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(await screen.findByRole('button', { name: /Tomato soup/ }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(props.onDelete).toHaveBeenCalledWith(soup)
  })
})

describe('meal planner recipe links', () => {
  it('suggests recipe titles and links meals that name a recipe', async () => {
    const onOpenRecipe = vi.fn()
    render(
      <MealPlanner
        weekStart="2026-09-27"
        currentWeekStart="2026-09-27"
        today={TODAY}
        plans={{ [TODAY]: { breakfast: '', lunch: '', dinner: 'Chicken tacos', notes: '' } }}
        onSave={vi.fn()}
        onWeekChange={vi.fn()}
        recipeTitles={['Chicken tacos', 'Tomato soup']}
        hasRecipe={(t) => !!findRecipe([tacos, soup], t)}
        onOpenRecipe={onOpenRecipe}
      />,
    )
    expect(screen.getByLabelText('Tuesday dinner')).toHaveAttribute('list', 'recipe-titles')
    expect(screen.getByLabelText('Tuesday notes')).not.toHaveAttribute('list')
    expect(document.querySelectorAll('#recipe-titles option')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Open recipe for Tuesday dinner' }))
    expect(onOpenRecipe).toHaveBeenCalledWith('Chicken tacos')
    expect(screen.getAllByRole('button', { name: /Open recipe/ })).toHaveLength(1)
  })
})
