import { describe, expect, it } from 'vitest'
import { aisleFor, categoryFor } from './aisles.js'

describe('aisleFor', () => {
  it('sorts groceries into store aisles with the ingredient dictionary', () => {
    expect(aisleFor('scallions')).toBe('Produce')
    expect(aisleFor('2 lemons')).toBe('Produce')
    expect(aisleFor('fresh basil')).toBe('Produce')
    expect(aisleFor('chicken thighs')).toBe('Meat & Seafood')
    expect(aisleFor('salmon')).toBe('Meat & Seafood')
    expect(aisleFor('Milk')).toBe('Dairy & Eggs')
    expect(aisleFor('a dozen eggs')).toBe('Dairy & Eggs')
    expect(aisleFor('cheddar')).toBe('Dairy & Eggs')
    expect(aisleFor('sourdough bread')).toBe('Bakery')
    expect(aisleFor('rice')).toBe('Pantry')
    expect(aisleFor('can of diced tomatoes')).toBe('Pantry')
    expect(aisleFor('frozen peas')).toBe('Frozen')
    expect(aisleFor('paper towels')).toBe('Household')
    expect(aisleFor('birthday card')).toBeNull()
  })

  it('files an item under the list category with that aisle name', () => {
    const cats = [
      { id: 'a', name: 'produce' },
      { id: 'b', name: 'Dairy & Eggs' },
    ]
    expect(categoryFor('bananas', cats)).toBe('a')
    expect(categoryFor('milk', cats)).toBe('b')
    expect(categoryFor('rice', cats)).toBeNull()
    expect(categoryFor('milk', [])).toBeNull()
  })
})
