import { render, screen, within } from '@testing-library/react'
import { choose } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { entryFor, facetOptions, filterCatalog, findEntry, NO_FILTERS } from './catalog'
import { structured, type Recipe } from './recipesApi'
import { TestBook } from './TestBook'

const r = (id: string, title: string, ingredients: string, extra: Partial<Recipe> = {}): Recipe => ({ id, title, ingredients, steps: 'Cook.', minutes: null, servings: null, url: null, ...extra })

const curry = r('c', 'Chicken Tikka Masala', '1 lb chicken thighs\n1 cup yogurt\n2 tbsp garam masala\n1 tsp turmeric', { minutes: 50, source: { type: 'online', siteName: 'Test Kitchen' } })
const salad = r('s', 'Chickpea Salad', '1 can chickpeas\n1 cucumber\n2 tbsp olive oil\n1 lemon', { minutes: 15, favorite: true })
const cake = r('k', 'Chocolate Cake', '2 cups flour\n1 cup sugar\n2 eggs\n1 cup milk', { minutes: 75, source: { type: 'cookbook', bookTitle: 'Baking Day' } })
const recipes = [curry, salad, cake]
const entries = recipes.map((x) => entryFor({ ...structured(x), ...x }))

describe('catalog filters', () => {
  it('filters by tags, time, source, favorites, and search over titles, ingredients, and books', () => {
    const ids = (f: Partial<typeof NO_FILTERS>) => filterCatalog(entries, { ...NO_FILTERS, ...f }).map((e) => e.id)
    expect(ids({ cuisine: 'indian' })).toEqual(['c'])
    expect(ids({ diet: 'vegan' })).toEqual(['s'])
    expect(ids({ meal: 'dessert' })).toEqual(['k'])
    expect(ids({ main: 'chicken' })).toEqual(['c'])
    expect(ids({ time: 'quick' })).toEqual(['s'])
    expect(ids({ time: 'long' })).toEqual(['k'])
    expect(ids({ source: 'cookbook' })).toEqual(['k'])
    expect(ids({ source: 'manual' })).toEqual(['s'])
    expect(ids({ favorites: true })).toEqual(['s'])
    expect(ids({ q: 'garam' })).toEqual(['c'])
    expect(ids({ q: 'baking day' })).toEqual(['k'])
    expect(ids({ q: 'CHICK' }).sort()).toEqual(['c', 's'])
  })

  it('offers only options that would show something, with counts', () => {
    const diet = facetOptions(entries, NO_FILTERS, 'diet')
    expect(diet).toEqual(expect.arrayContaining([{ value: 'vegetarian', count: 2 }, { value: 'vegan', count: 1 }]))
    expect(facetOptions(entries, { ...NO_FILTERS, favorites: true }, 'meal').map((o) => o.value)).toEqual(['lunch'])
    expect(facetOptions(entries, NO_FILTERS, 'source')).toEqual([
      { value: 'cookbook', count: 1 },
      { value: 'online', count: 1 },
      { value: 'manual', count: 1 },
    ])
  })

  it('finds a meal plan entry by title', () => {
    expect(findEntry(entries, ' chocolate CAKE ')?.id).toBe('k')
    expect(findEntry(entries, 'Leftovers')).toBeUndefined()
  })
})

describe('Recipe catalog', () => {
  const setup = (extra: Partial<Parameters<typeof TestBook>[0]> = {}) => {
    const props = { recipes, today: '2026-10-01', onSave: vi.fn(), onDelete: vi.fn(), onPlan: vi.fn(), onFavorite: vi.fn(), onSaveTags: vi.fn(), ...extra }
    render(<TestBook {...props} />)
    return { props, user: userEvent.setup() }
  }
  const rows = () => within(screen.getByRole('list', { name: 'Recipes' })).getAllByRole('button', { name: /^(?!Favorite)/ }).map((b) => b.textContent)

  it('filters with the Filters panel and the Favorites chip', async () => {
    const { user } = setup()
    expect(screen.getByText('3 recipes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await choose(user, screen.getByLabelText('Diet'), 'vegetarian')
    expect(rows()).toEqual([expect.stringContaining('Chickpea Salad'), expect.stringContaining('Chocolate Cake')])
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Favorites' }))
    expect(rows()).toEqual([expect.stringContaining('Chickpea Salad')])
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(rows()).toHaveLength(3)
  })

  it('stars favorites from the list and the recipe', async () => {
    const { props, user } = setup()
    const star = screen.getByRole('button', { name: 'Favorite Chickpea Salad' })
    expect(star).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Favorite Chicken Tikka Masala' }))
    expect(props.onFavorite).toHaveBeenCalledWith('c', true)
    await user.click(screen.getByRole('button', { name: /^Chocolate Cake/ }))
    await user.click(within(screen.getByRole('article', { name: 'Chocolate Cake' })).getByRole('button', { name: 'Favorite Chocolate Cake' }))
    expect(props.onFavorite).toHaveBeenLastCalledWith('k', true)
  })

  it('shows web credit and rating, and edits tags', async () => {
    const web = { ...curry, ...structured(curry), credit: 'Sam Cook, Test Kitchen', url: 'https://testkitchen.example/tikka', rating: { value: 4.7, count: 1234 } }
    const { props, user } = setup({ recipes: [web, salad] })
    await user.click(screen.getByRole('button', { name: /^Chicken Tikka Masala/ }))
    const article = screen.getByRole('article', { name: 'Chicken Tikka Masala' })
    expect(article).toHaveTextContent('From Sam Cook, Test Kitchen')
    expect(article).toHaveTextContent('★ 4.7 (1,234)')
    expect(within(article).getByRole('link', { name: /View original/ })).toHaveAttribute('href', 'https://testkitchen.example/tikka')
    expect(within(article).getByLabelText('Tags')).toHaveTextContent('Indian')
    await user.click(within(article).getByRole('button', { name: 'Edit tags' }))
    await user.click(screen.getByRole('button', { name: 'Thai' }))
    await user.click(screen.getByRole('button', { name: 'Save tags' }))
    expect(props.onSaveTags).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }), expect.objectContaining({ cuisine: expect.arrayContaining(['indian', 'thai']) }))
  })
})
