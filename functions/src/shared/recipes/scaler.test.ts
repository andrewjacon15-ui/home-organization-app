import { describe, expect, it } from 'vitest'
import { scaleFactor, scaleLine } from './scaler.js'

describe('scaleLine', () => {
  it('scales the leading amount in kitchen fractions and keeps the wording', () => {
    expect(scaleLine('1 1/2 cups flour', 2)).toBe('3 cups flour')
    expect(scaleLine('½ cup sugar', 1.5)).toBe('3/4 cup sugar')
    expect(scaleLine('2 (14-ounce) cans diced tomatoes, drained', 2)).toBe('4 (14-ounce) cans diced tomatoes, drained')
    expect(scaleLine('1-2 jalapeños', 2)).toBe('2-4 jalapeños')
    expect(scaleLine('3 eggs', 0.5)).toBe('1 1/2 eggs')
    expect(scaleLine('1 tsp salt', 1 / 3)).toBe('1/3 tsp salt')
    expect(scaleLine('half an onion', 2)).toBe('1 onion')
  })

  it('makes the unit or a short name agree with the new amount', () => {
    expect(scaleLine('3/4 cup sugar', 2)).toBe('1 1/2 cups sugar')
    expect(scaleLine('1 1/2 cups flour', 0.5)).toBe('3/4 cup flour')
    expect(scaleLine('1 egg', 2)).toBe('2 eggs')
    expect(scaleLine('1 large onion, diced', 3)).toBe('3 large onions, diced')
    expect(scaleLine('2 ripe bananas', 0.5)).toBe('1 ripe banana')
    expect(scaleLine('1 pinch saffron', 2)).toBe('2 pinches saffron')
    expect(scaleLine('1 tbsp butter', 2)).toBe('2 tbsp butter')
    expect(scaleLine('1 teaspoon vanilla', 3)).toBe('3 teaspoons vanilla')
    expect(scaleLine('1 can black beans, drained and rinsed', 2)).toBe('2 cans black beans, drained and rinsed')
    // Long names are left as written rather than guessed at.
    expect(scaleLine('1 boneless skinless chicken breast half', 2)).toBe('2 boneless skinless chicken breast half')
  })

  it('leaves lines without an amount, and factor 1, untouched', () => {
    expect(scaleLine('Salt and pepper, to taste', 3)).toBe('Salt and pepper, to taste')
    expect(scaleLine('  1 ½ cups milk ', 1)).toBe('1 ½ cups milk')
    expect(scaleLine('2 cups rice', 0)).toBe('2 cups rice')
  })

  it('works out the factor from servings', () => {
    expect(scaleFactor(4, 6)).toBe(1.5)
    expect(scaleFactor(null, 6)).toBe(1)
    expect(scaleFactor(4, null)).toBe(1)
  })
})
