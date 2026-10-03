import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChipList } from '../settings/KitchenSettings'
import { entryFor } from './catalog'
import { KitchenSearch, WebSearch } from './Finder'
import type { OnlineResult } from './kitchenApi'
import { RecipeHome } from './RecipeHome'
import { structured, type Recipe } from './recipesApi'

const r = (id: string, title: string, ingredients: string, extra: Partial<Recipe> = {}): Recipe => ({ id, title, ingredients, steps: 'Cook.', servings: null, minutes: 20, url: null, ...extra })
const recipes = [
  r('fr', 'Fried Rice', '3 cups rice\n2 eggs\n1 cup peas\n2 tbsp soy sauce\n1 tbsp oil'),
  r('ta', 'Chicken Tacos', '1 lb chicken thighs\n8 tortillas\n1 lime\nsalt'),
  r('pa', 'Pancakes', '2 cups flour\n2 eggs\n1 cup milk', { favorite: true }),
  r('st', 'Beef Stew', '2 lb beef chuck\n4 carrots\n1 onion'),
]
const entries = recipes.map((x) => entryFor({ ...structured(x), ...x }))

const web: OnlineResult = {
  url: 'https://budgetbytes.com/fried-rice',
  title: 'Easy Fried Rice',
  siteName: 'Budget Bytes',
  credit: 'Beth, Budget Bytes',
  image: null,
  minutes: 25,
  servings: 4,
  yieldText: null,
  rating: { value: 4.6, count: 900 },
  ingredientLines: ['3 cups rice', '2 eggs'],
  steps: ['Fry the rice.'],
  match: 1,
  have: ['rice', 'egg'],
  missing: [],
  score: 0.95,
  searchRank: 1,
  reasons: ['You have every ingredient', 'Rated 4.6★ by 900 cooks', '#1 of 6 in web search (Budget Bytes)'],
  parts: { match: 1, rating: 0.78, search: 1 },
}

afterEach(() => vi.restoreAllMocks())

describe('Recipes start', () => {
  it('offers the three ways in, and favorites one tap away', async () => {
    const onPick = vi.fn()
    const onOpen = vi.fn()
    const user = userEvent.setup()
    render(<RecipeHome entries={entries} onlineReady={false} onPick={onPick} onOpen={onOpen} />)
    expect(screen.getByRole('button', { name: /Our recipes.*4 recipes/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Search the web.*Paste a link/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /What's in my kitchen/ }))
    expect(onPick).toHaveBeenCalledWith('kitchen')
    await user.click(screen.getByRole('button', { name: 'Pancakes' }))
    expect(onOpen).toHaveBeenCalledWith('pa')
  })
})

function kitchen(extra: Partial<Parameters<typeof KitchenSearch>[0]> = {}) {
  const props = { entries, staples: ['salt', 'pepper', 'oil', 'water'], onOpen: vi.fn(), ...extra }
  render(<KitchenSearch {...props} />)
  return { props, user: userEvent.setup() }
}

describe("What's in my kitchen", () => {
  it('ranks our recipes by what you have, with reasons, have, and missing', async () => {
    const { props, user } = kitchen()
    await user.type(screen.getByLabelText('Ingredients'), 'I have rice, some eggs and peas')
    expect(screen.getByText('Using: rice, egg, pea')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Our recipes/ }))
    const cards = within(screen.getByRole('list', { name: 'Best matches' })).getAllByRole('listitem', { name: undefined }).filter((li) => li.classList.contains('result-card'))
    expect(cards).toHaveLength(4)
    expect(cards[0]).toHaveTextContent('Fried Rice')
    expect(within(cards[0]).getByRole('list', { name: 'Why Fried Rice' })).toHaveTextContent('You have 3 of its 4 ingredients')
    expect(cards[0]).toHaveTextContent('Have: rice, egg, pea')
    expect(cards[0]).toHaveTextContent('Missing: soy sauce')
    expect(within(cards[0]).getByLabelText('Ingredients 75%')).toBeInTheDocument()
    expect(cards[1]).toHaveTextContent('One of your favorites')
    await user.click(within(cards[0]).getByRole('button', { name: 'Fried Rice' }))
    expect(props.onOpen).toHaveBeenCalledWith('fr')
  })

  it('asks for ingredients first', async () => {
    const { user } = kitchen()
    await user.click(screen.getByRole('button', { name: /Our recipes/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Tell me a few ingredients')
  })

  it('searches online: five choices, why each one ranked where it did, a look, then Cook this', async () => {
    const onFindOnline = vi.fn(async () => [web])
    const onCookOnline = vi.fn(async () => 'web_1')
    const { user } = kitchen({ onFindOnline, onCookOnline })
    await user.type(screen.getByLabelText('Ingredients'), 'rice, eggs')
    await user.click(screen.getByRole('button', { name: /Online/ }))
    expect(onFindOnline).toHaveBeenCalledWith('rice, eggs')
    const list = await screen.findByRole('list', { name: 'Best matches' })
    expect(screen.getByText(/Ranked by how many of the ingredients you have \(60%\), cooks’ ratings \(25%\)/)).toBeInTheDocument()
    const card = within(list).getAllByRole('listitem')[0]
    expect(within(card).getByRole('list', { name: 'Why Easy Fried Rice' })).toHaveTextContent('Rated 4.6★ by 900 cooks')
    expect(within(card).getByLabelText('Search rank 100%')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Look at the recipe' }))
    expect(within(card).getByRole('region', { name: 'Steps for Easy Fried Rice' })).toHaveTextContent('Fry the rice.')
    await user.click(within(card).getByRole('button', { name: 'Cook this' }))
    await waitFor(() => expect(onCookOnline).toHaveBeenCalledWith(web))
  })

  it('shows online as not turned on when it isn’t', () => {
    kitchen()
    expect(screen.getByRole('button', { name: /Online.*Not turned on yet/ })).toBeDisabled()
  })

  it('shows why an online search failed', async () => {
    const onFindOnline = vi.fn(async () => {
      throw new Error("This month's online searches are used up.")
    })
    const { user } = kitchen({ onFindOnline })
    await user.type(screen.getByLabelText('Ingredients'), 'rice')
    await user.click(screen.getByRole('button', { name: /Online/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('used up')
  })

  it('says voice is unavailable where the browser has no speech recognition (the wall tablet)', async () => {
    const { user } = kitchen()
    await user.click(screen.getByRole('button', { name: 'Say what you have' }))
    expect(screen.getByText("Voice isn't available on this screen. Type instead.")).toBeInTheDocument()
  })

  it('fills the box from speech where it is supported', async () => {
    class FakeRecognition {
      lang = ''
      interimResults = false
      continuous = false
      onresult: ((e: unknown) => void) | null = null
      onend: (() => void) | null = null
      onerror = null
      start() {
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: 'chicken and rice' }]] })
          this.onend?.()
        })
      }
      stop() {}
    }
    ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition
    try {
      const { user } = kitchen()
      await user.click(screen.getByRole('button', { name: 'Say what you have' }))
      await waitFor(() => expect(screen.getByLabelText('Ingredients')).toHaveValue('chicken and rice'))
    } finally {
      delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    }
  })
})

describe('Search the web', () => {
  it('finds a dish by name and ranks it by ratings and search position', async () => {
    const onFind = vi.fn(async () => [{ ...web, parts: { match: null, rating: 0.78, search: 1 }, reasons: ['Rated 4.6★ by 900 cooks', '#1 of 6 in web search (Budget Bytes)'] }])
    const user = userEvent.setup()
    render(<WebSearch onFind={onFind} onImport={vi.fn()} onOpen={vi.fn()} />)
    await user.type(screen.getByLabelText('Dish'), 'fried rice')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(onFind).toHaveBeenCalledWith('fried rice')
    expect(await screen.findByText(/Ranked by cooks’ ratings \(60%\) and where the web search placed it \(40%\)/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Ingredients \d+%$/)).not.toBeInTheDocument()
  })

  it('adds a recipe from a link and opens it, even with online search off', async () => {
    const onImport = vi.fn(async () => ({ id: 's', title: 'Chickpea Salad', existed: false, needsReview: false }))
    const onOpen = vi.fn()
    const user = userEvent.setup()
    render(<WebSearch onImport={onImport} onOpen={onOpen} />)
    expect(screen.getByText(/isn’t turned on yet/)).toBeInTheDocument()
    const add = screen.getByRole('button', { name: 'Add recipe' })
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText('Recipe link'), 'https://example.com/salad')
    await user.click(add)
    expect(onImport).toHaveBeenCalledWith('https://example.com/salad')
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('s'))
  })

  it('shows why an import failed', async () => {
    const onImport = vi.fn(async () => {
      throw new Error("example.com asks automated tools not to read this page, so it can't be imported. You can add the recipe by hand.")
    })
    const user = userEvent.setup()
    render(<WebSearch onImport={onImport} onOpen={vi.fn()} />)
    await user.type(screen.getByLabelText('Recipe link'), 'https://example.com/x')
    await user.click(screen.getByRole('button', { name: 'Add recipe' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('asks automated tools not to read')
  })
})

describe('Kitchen settings chip list', () => {
  function Harness({ onChange }: { onChange: (v: string[]) => void }) {
    const [items, setItems] = useState(['seriouseats.com'])
    return (
      <ChipList
        label="Recipe sites"
        items={items}
        normalize={(s) => (s.includes('.') ? s.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*/, '') : null)}
        placeholder="site"
        resetTo={['a.com']}
        onChange={(v) => {
          setItems(v)
          onChange(v)
        }}
      />
    )
  }

  it('adds normalized entries, rejects bad ones, and removes', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByLabelText('Add to recipe sites')
    fireEvent.change(input, { target: { value: 'https://www.thekitchn.com/recipe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onChange).toHaveBeenLastCalledWith(['seriouseats.com', 'thekitchn.com'])
    fireEvent.change(input, { target: { value: 'nonsense' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText("That doesn't look right.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove seriouseats.com' }))
    expect(onChange).toHaveBeenLastCalledWith(['thekitchn.com'])
  })
})
