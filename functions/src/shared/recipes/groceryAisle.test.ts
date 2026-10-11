import { describe, expect, it } from 'vitest'
import { groceryAisle, groceryCategory, itemWords, learnKey, singular } from './groceryAisle.js'

describe('grocery aisles', () => {
  it('files everyday items, brands included', () => {
    const cases: Record<string, string> = {
      bananas: 'Produce',
      '2 bags Organic Strawberries': 'Produce',
      'chicken thighs': 'Meat & Seafood',
      'hot dogs': 'Meat & Seafood',
      '1 gallon whole milk': 'Dairy & Eggs',
      'greek yogurt': 'Dairy & Eggs',
      hummus: 'Dairy & Eggs',
      bagels: 'Bakery',
      'dinner rolls': 'Bakery',
      'black beans': 'Pantry',
      'chicken broth': 'Pantry',
      cheerios: 'Pantry',
      'potato chips': 'Snacks & Drinks',
      cookies: 'Snacks & Drinks',
      'la croix': 'Snacks & Drinks',
      coffee: 'Snacks & Drinks',
      'frozen peas': 'Frozen',
      popsicles: 'Frozen',
      'bag of ice': 'Frozen',
      'sandwich bags': 'Household',
      'toilet paper 12 rolls': 'Household',
      'dog food': 'Household',
      ibuprofen: 'Household',
      'gift wrap': 'Household',
      'tortilla wraps': 'Bakery',
    }
    for (const [text, aisle] of Object.entries(cases)) expect([text, groceryAisle(text)]).toEqual([text, aisle])
  })

  it('reads the last word as the thing ("potato chips" are chips, not potatoes)', () => {
    expect(groceryAisle('tortilla chips')).toBe('Snacks & Drinks')
    expect(groceryAisle('coconut milk')).toBe('Pantry')
    expect(groceryAisle('green beans')).toBe('Produce')
    expect(groceryAisle('ice cream')).toBe('Frozen')
  })

  it('forgives typos', () => {
    expect(groceryAisle('bananna')).toBe('Produce')
    expect(groceryAisle('brocoli')).toBe('Produce')
    expect(groceryAisle('strawberys')).toBe('Produce')
    expect(groceryAisle('yoghurt')).toBe('Dairy & Eggs')
  })

  it('gives up rather than guessing', () => {
    expect(groceryAisle('birthday present for Max')).toBeNull()
    expect(groceryAisle('birthday present wrap')).toBeNull()
  })

  it('reduces an item to the words that name it', () => {
    expect(singular('strawberries')).toBe('strawberry')
    expect(singular('cookies')).toBe('cookie')
    expect(singular('tomatoes')).toBe('tomato')
    expect(singular('hummus')).toBe('hummus')
    expect(itemWords('3 lbs Fresh Organic Bananas (ripe)')).toEqual(['banana'])
    expect(learnKey('2 bags Organic Strawberries')).toBe('strawberry')
    expect(learnKey('sandwich bags')).toBe('sandwich bag')
  })
})

describe('grocery categories, learned from moves', () => {
  const cats = [
    { id: 'p', name: 'Produce' },
    { id: 'd', name: 'Dairy & Eggs' },
    { id: 'c', name: 'Costco run' },
  ]

  it('picks the category named for the aisle', () => {
    expect(groceryCategory('bananas', cats)).toBe('p')
    expect(groceryCategory('potato chips', cats)).toBeNull() // no Snacks & Drinks category on this list
  })

  it('follows where the household moved an item before, in any wording', () => {
    const learned = { 'paper towel': 'c', yogurt: 'c', 'mystery thing': '' }
    expect(groceryCategory('Paper Towels', cats, learned)).toBe('c')
    expect(groceryCategory('2 packs paper towels', cats, learned)).toBe('c')
    // The thing itself was taught, so a kind of it follows.
    expect(groceryCategory('vanilla yogurt', cats, learned)).toBe('c')
    // Moved to the top: stays there.
    expect(groceryCategory('mystery thing', cats, learned)).toBeNull()
    // A taught category that's since been removed is ignored.
    expect(groceryCategory('bananas', cats, { banana: 'gone' })).toBe('p')
  })
})
