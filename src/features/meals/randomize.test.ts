import { describe, expect, it } from 'vitest'
import type { CatalogEntry } from '../recipes/catalog'
import { candidatesFor, pickMeals } from './randomize'
import { mealSource, scaleFor } from './shopping'

const entry = (t: string, o: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: t.toLowerCase().replace(/\W+/g, '-'),
  t,
  k: [],
  fa: [],
  g: { meal: [], cuisine: [], main: [], diet: [] },
  m: 30,
  s: 'manual',
  b: null,
  f: false,
  r: false,
  rv: null,
  rc: null,
  n: 4,
  ...o,
})
const tags = (meal: string[], main: string[] = []) => ({ meal, cuisine: [], main, diet: [] })
/** A fixed sequence instead of Math.random. */
const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('candidatesFor', () => {
  const book = [
    entry('Tacos', { g: tags(['dinner']) }),
    entry('Chili'),
    entry('Pancakes', { g: tags(['breakfast']) }),
    entry('Brownies', { g: tags(['dessert']) }),
    entry('Peanut noodles', { k: ['peanut butter'], fa: ['peanut'] }),
    entry('New import', { r: true }),
  ]

  it('dinner takes recipes tagged for it and untagged ones; never desserts, unreviewed or avoided ones', () => {
    expect(candidatesFor(book, 'dinner', ['peanut']).map((e) => e.t)).toEqual(['Tacos', 'Chili'])
  })

  it('breakfast and lunch take their own tags first, else untagged mains', () => {
    expect(candidatesFor(book, 'breakfast').map((e) => e.t)).toEqual(['Pancakes'])
    expect(candidatesFor(book, 'lunch').map((e) => e.t)).toEqual(['Chili', 'Peanut noodles'])
  })
})

describe('pickMeals', () => {
  const book = ['Tacos', 'Chili', 'Pasta', 'Curry', 'Soup'].map((t) => entry(t))

  it('never repeats a recipe in a week, or picks one already planned', () => {
    const picked = pickMeals(book, ['1', '2', '3', '4'].map((day) => ({ day, slot: 'dinner' as const })), { taken: ['tacos'], random: seq(0) })
    const titles = Object.values(picked)
    expect(new Set(titles).size).toBe(4)
    expect(titles).not.toContain('Tacos')
  })

  it('skips the last two weeks while there is anything else, then allows them', () => {
    const recent = ['Tacos', 'Chili', 'Pasta', 'Curry']
    expect(pickMeals(book, [{ day: '1', slot: 'dinner' }], { recent, random: seq(0.99) })).toEqual({ '1:dinner': 'Soup' })
    const two = pickMeals(book, [{ day: '1', slot: 'dinner' }, { day: '2', slot: 'dinner' }], { recent, random: seq(0) })
    expect(two['1:dinner']).toBe('Soup')
    expect(two['2:dinner']).toBe('Tacos')
  })

  it('favors favorites, and spreads out what dinners are built on', () => {
    const chicken = (t: string) => entry(t, { g: tags([], ['chicken']) })
    const list = [chicken('Chicken A'), chicken('Chicken B'), chicken('Chicken C'), entry('Fish', { g: tags([], ['fish']) })]
    // After two chicken dinners, a third weighs 0.3 × 0.5 (also yesterday's main) against fish at 1.
    const picked = pickMeals(list, ['1', '2', '3'].map((day) => ({ day, slot: 'dinner' as const })), { random: seq(0, 0, 0.5) })
    expect(picked['3:dinner']).toBe('Fish')
    const fav = [entry('Plain'), entry('Loved', { f: true })]
    // 2 of 3 of the weight is the favorite.
    expect(pickMeals(fav, [{ day: '1', slot: 'dinner' }], { random: seq(0.5) })['1:dinner']).toBe('Loved')
  })

  it('leaves a meal out when nothing suits it', () => {
    expect(pickMeals([entry('Tacos')], [{ day: '1', slot: 'dinner' }, { day: '2', slot: 'dinner' }], { random: seq(0) })).toEqual({ '1:dinner': 'Tacos' })
  })
})

describe('shopping helpers', () => {
  it('scales only when both the people and the servings are known', () => {
    expect(scaleFor(6, 4)).toBe(1.5)
    expect(scaleFor(null, 4)).toBe(1)
    expect(scaleFor(6, null)).toBe(1)
  })

  it('names the meal a grocery line is for', () => {
    expect(mealSource({ date: '2026-10-06', slot: 'dinner', text: 'Tacos' })).toMatch(/^Tue dinner: Tacos$/)
  })
})
