import { describe, expect, it } from 'vitest'
import type { ListItem } from '../lists/listsApi'
import type { MealPlan } from '../../types'
import { mealGroceryChanges, mealsWithoutGroceries, staleGroceries } from './shopping'

const item = (id: string, text: string, meals?: string[], done = false): ListItem => ({ id, text, done, memberId: null, order: 0, ...(meals ? { meals } : {}) })
const plan = (p: Partial<MealPlan>): MealPlan => ({ breakfast: '', lunch: '', dinner: '', notes: '', ...p })
// 2026-10-25 is a Sunday.
const WEEK = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']

describe('mealGroceryChanges', () => {
  it('adds new lines, and adds a line another meal put on the list into that item', () => {
    const items = [item('a', '1 onion', ['2026-10-26:dinner']), item('b', 'milk')]
    const { add, merge } = mealGroceryChanges(
      [
        { line: '2 onions', sources: ['2026-10-27:dinner'] },
        { line: '1 lb ground beef', sources: ['2026-10-27:dinner'] },
      ],
      items,
    )
    expect(add).toEqual([{ text: '1 lb ground beef', meals: ['2026-10-27:dinner'] }])
    expect(merge).toEqual([{ item: items[0], text: '3 onions', meals: ['2026-10-26:dinner', '2026-10-27:dinner'] }])
  })

  it('leaves bought items and ones added by hand alone', () => {
    const { add, merge } = mealGroceryChanges([{ line: '1 onion', sources: ['2026-10-27:dinner'] }], [item('a', '1 onion', ['2026-10-26:dinner'], true), item('b', 'onion')])
    expect(merge).toEqual([])
    expect(add).toEqual([{ text: '1 onion', meals: ['2026-10-27:dinner'] }])
  })
})

describe('syncing a week', () => {
  const plans = {
    '2026-10-26': plan({ dinner: 'Tacos' }),
    '2026-10-28': plan({ dinner: 'Chili', lunch: 'Soup' }),
  }

  it('finds groceries whose meals were all cleared this week', () => {
    const items = [
      item('cleared', 'beans', ['2026-10-27:dinner']),
      item('still', 'tortillas', ['2026-10-26:dinner']),
      item('half', 'onion', ['2026-10-27:dinner', '2026-10-28:dinner']),
      item('nextweek', 'rice', ['2026-10-27:dinner', '2026-11-02:dinner']),
      item('bought', 'cheese', ['2026-10-27:dinner'], true),
      item('byhand', 'milk'),
    ]
    expect(staleGroceries(items, plans, WEEK).map((i) => i.id)).toEqual(['cleared'])
  })

  it('finds meals from today on with nothing on the list for them', () => {
    const items = [item('a', 'beef', ['2026-10-28:dinner']), item('b', 'tortillas', ['2026-10-26:dinner'], true)]
    expect(mealsWithoutGroceries(items, plans, WEEK, '2026-10-26')).toEqual([{ date: '2026-10-28', slot: 'lunch', text: 'Soup' }])
    expect(mealsWithoutGroceries([], plans, WEEK, '2026-10-27').map((m) => `${m.date}:${m.slot}`)).toEqual(['2026-10-28:lunch', '2026-10-28:dinner'])
  })
})
