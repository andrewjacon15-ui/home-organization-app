import { describe, expect, it } from 'vitest'
import { groceryLines } from './groceries.js'
import { metricText, toMetric } from './metric.js'
import { scaleLine } from './scaler.js'

describe('toMetric', () => {
  it('turns US volumes and weights into ml and grams, rounded the way a cook would measure', () => {
    expect(toMetric('1 1/2 cups milk')).toBe('350 ml milk')
    expect(toMetric('1 tbsp olive oil')).toBe('15 ml olive oil')
    expect(toMetric('1/2 tsp salt')).toBe('2.5 ml salt')
    expect(toMetric('2 lb chicken thighs')).toBe('905 g chicken thighs')
    expect(toMetric('8 oz cream cheese, softened')).toBe('225 g cream cheese, softened')
    expect(toMetric('1 gallon water')).toBe('3.8 L water')
    expect(toMetric('1-2 cups broth')).toBe('240-470 ml broth')
  })

  it('keeps counts and converts package sizes inside the line', () => {
    expect(toMetric('2 (14-ounce) cans diced tomatoes')).toBe('2 (395 g) cans diced tomatoes')
    expect(toMetric('3 cloves garlic')).toBe('3 cloves garlic')
    expect(toMetric('Salt, to taste')).toBe('Salt, to taste')
    expect(toMetric('100 g butter')).toBe('100 g butter')
  })

  it('works on scaled lines', () => {
    expect(toMetric(scaleLine('1 cup rice', 2))).toBe('470 ml rice')
  })
})

describe('metricText', () => {
  it('converts oven temperatures, pan sizes and weights in steps', () => {
    expect(metricText('Bake at 350°F for 30 minutes in a 9x13-inch pan.')).toBe('Bake at 175°C for 30 minutes in a 23 x 33 cm pan.')
    expect(metricText('Heat the oven to 425 degrees F.')).toBe('Heat the oven to 220°C.')
    expect(metricText('Roll to 1/4 inch, about a 2-pound piece')).toBe('Roll to 0.5 cm, about a 905 g piece')
    expect(metricText('Cut into 2-inch pieces')).toBe('Cut into 5 cm pieces')
  })
})

describe('groceryLines', () => {
  it('adds up the same ingredient across recipes when the units match', () => {
    const plan = groceryLines(['1 cup rice', '2 cups rice', '1 lb ground beef', '1 onion, diced', '2 onions', '8 oz ground beef'])
    expect(plan.lines).toEqual(['3 cups rice', '1 lb ground beef', '3 onions', '8 oz ground beef'])
  })

  it('leaves out staples, group labels, and what is already on the list', () => {
    const plan = groceryLines(['For the sauce:', '1 tsp salt', '2 tbsp olive oil', '2 limes', 'Cilantro'], ['salt', 'oil'], ['Limes', 'milk'])
    expect(plan.lines).toEqual(['Cilantro'])
    expect(plan.staples).toEqual(['salt', 'olive oil'])
    expect(plan.onList).toEqual(['lime'])
  })

  it('keeps a single mention as written', () => {
    expect(groceryLines(['2 (14-ounce) cans diced tomatoes, drained']).lines).toEqual(['2 (14-ounce) cans diced tomatoes, drained'])
  })
})
