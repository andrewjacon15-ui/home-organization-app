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
  it('adds up the same ingredient across recipes, whatever the wording', () => {
    const plan = groceryLines(['1 cup rice', '2 cups rice', '1 lb ground beef', '1 onion, diced', '2 onions', '8 oz ground beef'])
    expect(plan.lines).toEqual(['3 cups rice', '1 1/2 lb ground beef', '3 onions'])
  })

  it('converts units before adding, and writes the total in the unit a shopper reads best', () => {
    expect(groceryLines(['1 cup milk', '4 tbsp milk']).lines).toEqual(['1 1/4 cups milk'])
    expect(groceryLines(['2 tsp cumin', '1 tbsp cumin']).lines).toEqual(['2 tbsp cumin'])
    expect(groceryLines(['12 oz chicken thighs', '1/2 lb chicken thighs']).lines).toEqual(['1 1/4 lb chicken thighs'])
    expect(groceryLines(['200 g flour', '300 g flour']).lines).toEqual(['500 g flour'])
    expect(groceryLines(['2 cans black beans', '1 can black beans']).lines).toEqual(['3 cans black beans'])
  })

  it('rounds counts up to what you can buy, and shops a range at its top', () => {
    expect(groceryLines(['1/2 onion', '1/3 onion', '1 onion']).lines).toEqual(['2 onions'])
    expect(groceryLines(['2-3 cloves garlic', '2 cloves garlic']).lines).toEqual(['5 cloves garlic'])
    // A single mention, scaled for more people.
    expect(groceryLines(['1 1/2 lemons', '1 1/2 cans coconut milk', '3/4 cup parmesan']).lines).toEqual(['2 lemons', '2 cans coconut milk', '3/4 cup parmesan'])
  })

  it('remembers which meals asked for each line', () => {
    const plan = groceryLines([
      { text: '1 lb ground beef', source: 'Tue: Tacos' },
      { text: '1 lb ground beef', source: 'Thu: Chili' },
      { text: '1 onion', source: 'Thu: Chili' },
    ])
    expect(plan.details).toEqual([
      { line: '2 lb ground beef', sources: ['Tue: Tacos', 'Thu: Chili'] },
      { line: '1 onion', sources: ['Thu: Chili'] },
    ])
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
