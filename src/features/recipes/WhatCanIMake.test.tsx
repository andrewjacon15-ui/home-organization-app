import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChipList } from '../settings/KitchenSettings'
import { entryFor } from './catalog'
import type { OnlineResult } from './kitchenApi'
import { structured, type Recipe } from './recipesApi'
import { WhatCanIMake } from './WhatCanIMake'

const r = (id: string, title: string, ingredients: string): Recipe => ({ id, title, ingredients, steps: 'Cook.', servings: null, minutes: 20, url: null })
const recipes = [
  r('fr', 'Fried Rice', '3 cups rice\n2 eggs\n1 cup peas\n2 tbsp soy sauce\n1 tbsp oil'),
  r('ta', 'Chicken Tacos', '1 lb chicken thighs\n8 tortillas\n1 lime\nsalt'),
  r('pa', 'Pancakes', '2 cups flour\n2 eggs\n1 cup milk'),
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
}

afterEach(() => vi.restoreAllMocks())

function setup(extra: Partial<Parameters<typeof WhatCanIMake>[0]> = {}) {
  const props = { entries, staples: ['salt', 'pepper', 'oil', 'water'], onOpen: vi.fn(), onClose: vi.fn(), ...extra }
  render(<WhatCanIMake {...props} />)
  return { props, user: userEvent.setup() }
}

describe('What can I make?', () => {
  it('shows the top three catalog recipes with match %, have, and missing', async () => {
    const { props, user } = setup()
    await user.type(screen.getByLabelText('What do you have?'), 'I have rice, some eggs and peas')
    expect(screen.getByText('Using: rice, egg, pea')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Find recipes' }))
    const cards = within(screen.getByRole('list', { name: 'Best matches' })).getAllByRole('listitem')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveTextContent('Fried Rice')
    expect(cards[0]).toHaveTextContent('75% match')
    expect(cards[0]).toHaveTextContent('Have: rice, egg, pea')
    expect(cards[0]).toHaveTextContent('Missing: soy sauce')
    expect(cards[1]).toHaveTextContent('Pancakes')
    await user.click(within(cards[0]).getByRole('button', { name: 'Fried Rice' }))
    expect(props.onOpen).toHaveBeenCalledWith('fr')
  })

  it('asks for ingredients first', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Find recipes' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Tell me a few ingredients')
  })

  it('searches online, previews a result, and saves it when chosen', async () => {
    const onFindOnline = vi.fn(async () => [web])
    const onSaveOnline = vi.fn(async () => 'web_1')
    const { props, user } = setup({ onFindOnline, onSaveOnline })
    await user.type(screen.getByLabelText('What do you have?'), 'rice, eggs')
    await user.click(screen.getByRole('button', { name: 'Online' }))
    await user.click(screen.getByRole('button', { name: 'Find recipes' }))
    const card = await screen.findByRole('listitem')
    expect(card).toHaveTextContent('100% match · ★ 4.6 (900) · Beth, Budget Bytes · 25 min')
    expect(card).toHaveTextContent('You have everything.')
    expect(onFindOnline).toHaveBeenCalledWith('rice, eggs')
    await user.click(within(card).getByRole('button', { name: 'Easy Fried Rice' }))
    expect(within(card).getByRole('region', { name: 'Steps for Easy Fried Rice' })).toHaveTextContent('Fry the rice.')
    await user.click(within(card).getByRole('button', { name: 'Save to our recipes' }))
    await waitFor(() => expect(props.onOpen).toHaveBeenCalledWith('web_1'))
    expect(onSaveOnline).toHaveBeenCalledWith(web)
  })

  it('explains when online search is unavailable', async () => {
    const onFindOnline = vi.fn(async () => {
      throw new Error("Online search isn't set up yet. Recipes from your catalog still work.")
    })
    const { user } = setup({ onFindOnline })
    await user.type(screen.getByLabelText('What do you have?'), 'rice')
    await user.click(screen.getByRole('button', { name: 'Online' }))
    await user.click(screen.getByRole('button', { name: 'Find recipes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("isn't set up yet")
  })

  it('says voice is unavailable where the browser has no speech recognition (the wall tablet)', async () => {
    const { user } = setup()
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
      const { user } = setup()
      await user.click(screen.getByRole('button', { name: 'Say what you have' }))
      await waitFor(() => expect(screen.getByLabelText('What do you have?')).toHaveValue('chicken and rice'))
    } finally {
      delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    }
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
