import { describe, expect, it } from 'vitest'
import { familyOf, lookupPhrase, singular } from './dictionary.js'
import { extractRecipes, parseMinutes, type Block } from './extract.js'
import { ingredientLikeness, parseIngredient } from './ingredient.js'
import { formatQuantity, formatRange, normalizeFractions, readQuantity } from './quantity.js'

describe('fractions and quantities', () => {
  it.each([
    ['1', 1, null],
    ['1.5 cups', 1.5, null],
    ['½ cup', 0.5, null],
    ['1½ cups', 1.5, null],
    ['1 1/2 cups', 1.5, null],
    ['3/4 tsp', 0.75, null],
    ['1-2 cloves', 1, 2],
    ['1 – 2 cloves', 1, 2],
    ['2 to 3 tbsp', 2, 3],
    ['⅓ cup', 1 / 3, null],
    ['2⅔ cups', 2 + 2 / 3, null],
    ['a pinch', 1, null],
    ['an onion', 1, null],
    ['half an onion', 0.5, null],
    ['half a lemon', 0.5, null],
    ['one egg', 1, null],
    ['two dozen eggs', 24, null],
    ['a dozen eggs', 12, null],
    ['1,5 l', 1.5, null],
  ])('%s', (text, value, max) => {
    const q = readQuantity(text)!
    expect(q.value).toBeCloseTo(value as number, 5)
    expect(q.max).toBe(max)
  })

  it('finds nothing where there is no amount', () => {
    expect(readQuantity('salt to taste')).toBeNull()
    expect(readQuantity('')).toBeNull()
  })

  it('normalizes unicode fractions, dashes, and the fraction slash', () => {
    expect(normalizeFractions('1½–2¼ cups')).toBe('1 1/2-2 1/4 cups')
    expect(normalizeFractions('3⁄4 tsp')).toBe('3/4 tsp')
  })

  it('prints kitchen-friendly amounts', () => {
    expect(formatQuantity(1.5)).toBe('1 1/2')
    expect(formatQuantity(0.333)).toBe('1/3')
    expect(formatQuantity(2)).toBe('2')
    expect(formatQuantity(0.66)).toBe('2/3')
    expect(formatQuantity(1.99)).toBe('2')
    expect(formatQuantity(0.1)).toBe('0.1')
    expect(formatRange(1, 2)).toBe('1-2')
  })
})

describe('ingredient lines', () => {
  const p = (line: string) => {
    const i = parseIngredient(line)
    return { qty: i.qty, qtyMax: i.qtyMax, unit: i.unit, name: i.name, note: i.note, key: i.key }
  }

  it('splits quantity, unit, name, and prep note', () => {
    expect(p('1 1/2 cups finely chopped onion')).toEqual({ qty: 1.5, qtyMax: null, unit: 'cup', name: 'onion', note: 'finely chopped', key: 'onion' })
    expect(p('2 tbsp olive oil, divided')).toEqual({ qty: 2, qtyMax: null, unit: 'tbsp', name: 'olive oil', note: 'divided', key: 'olive oil' })
    expect(p('3 garlic cloves, minced')).toMatchObject({ qty: 3, unit: null, key: 'garlic', note: 'minced' })
    expect(p('4 cloves garlic, minced')).toMatchObject({ qty: 4, unit: 'clove', name: 'garlic', key: 'garlic' })
  })

  it('handles package sizes, ranges, and size words', () => {
    expect(p('2 (14-ounce) cans diced tomatoes, drained')).toMatchObject({ qty: 2, unit: 'can', name: 'diced tomatoes', key: 'canned tomato', note: '14-ounce, drained' })
    expect(p('1-2 jalapeños, seeded')).toMatchObject({ qty: 1, qtyMax: 2, key: 'chili pepper' })
    expect(p('2 large eggs')).toMatchObject({ qty: 2, name: 'eggs', note: 'large', key: 'egg' })
    expect(p('½ cup (1 stick) unsalted butter, softened')).toMatchObject({ qty: 0.5, unit: 'cup', key: 'butter', note: '1 stick, softened' })
  })

  it('keeps "to taste" and "for garnish" as notes', () => {
    expect(p('Salt and pepper, to taste')).toMatchObject({ qty: null, unit: null, note: 'to taste' })
    expect(p('Fresh parsley for garnish')).toMatchObject({ key: 'parsley', note: 'for garnish' })
  })

  it('maps synonyms and plurals to one key, with a family', () => {
    expect(p('3 scallions, thinly sliced').key).toBe('green onion')
    expect(p('1 bunch green onions').key).toBe('green onion')
    expect(p('2 lb boneless skinless chicken thighs').key).toBe('chicken thigh')
    expect(familyOf('chicken thigh')).toBe('chicken')
    expect(p('1 cup fresh cilantro leaves').key).toBe('cilantro')
    expect(p('2 cups mixed berries').key).toBe('berry')
  })

  it('makes a best guess for unknown foods', () => {
    const i = parseIngredient('1 cup dried tart cherries') // "cherry" is known, "tart" isn't
    expect(i.key).toBe('cherry')
    const odd = parseIngredient('2 tbsp gochujang')
    expect(odd).toMatchObject({ key: 'gochujang', known: false })
  })

  it('reads singular forms', () => {
    expect(singular('tomatoes')).toBe('tomato')
    expect(singular('berries')).toBe('berry')
    expect(singular('leaves')).toBe('leaf')
    expect(singular('peaches')).toBe('peach')
    expect(singular('asparagus')).toBe('asparagus')
    expect(singular('couscous')).toBe('couscous')
    expect(lookupPhrase('Spring Onions')).toBe('green onion')
  })

  it('tells ingredient lines from steps', () => {
    expect(ingredientLikeness('2 cups flour')).toBeGreaterThanOrEqual(0.5)
    expect(ingredientLikeness('1 onion, diced')).toBeGreaterThanOrEqual(0.5)
    expect(ingredientLikeness('Heat the oil in a large pan. Add the onion and cook for 5 minutes.')).toBeLessThan(0.5)
    expect(ingredientLikeness('This soup is a weeknight favorite in our house, and it freezes well.')).toBeLessThan(0.5)
  })
})

describe('times', () => {
  it('reads minutes from common forms', () => {
    expect(parseMinutes('1 hour 15 minutes')).toBe(75)
    expect(parseMinutes('45 mins')).toBe(45)
    expect(parseMinutes('1 h 30 m')).toBe(90)
    expect(parseMinutes('20-25 minutes')).toBe(25)
    expect(parseMinutes('overnight')).toBeNull()
  })
})

// Fixture 1: an EPUB chapter (real headings, labelled sections).
const epubChapter: Block[] = [
  { kind: 'heading', level: 1, text: 'Weeknight Dinners', loc: 'Chapter 3' },
  { kind: 'text', text: 'These are the recipes we make most nights, when time is short and everyone is hungry.' },
  { kind: 'heading', level: 2, text: 'Lemon Garlic Chicken', loc: 'Chapter 3' },
  { kind: 'text', text: 'Serves 4' },
  { kind: 'text', text: 'Prep time: 10 minutes · Cook time: 25 minutes' },
  { kind: 'heading', level: 3, text: 'Ingredients' },
  { kind: 'item', text: '1½ lb boneless skinless chicken thighs' },
  { kind: 'item', text: '3 tbsp olive oil' },
  { kind: 'item', text: '4 cloves garlic, minced' },
  { kind: 'item', text: '1 lemon, zested and juiced' },
  { kind: 'item', text: 'Salt and pepper, to taste' },
  { kind: 'heading', level: 3, text: 'Method' },
  { kind: 'item', text: '1. Pat the chicken dry and season with salt and pepper.' },
  { kind: 'item', text: '2. Heat the oil in a large skillet and brown the chicken, 6 minutes per side.' },
  { kind: 'item', text: '3. Add the garlic, lemon zest, and juice; simmer until the chicken is cooked through.' },
  { kind: 'heading', level: 2, text: 'Rice Pilaf', loc: 'Chapter 3' },
  { kind: 'text', text: 'Makes 6 servings' },
  { kind: 'item', text: '2 tbsp butter' },
  { kind: 'item', text: '1 small onion, finely chopped' },
  { kind: 'item', text: '1 1/2 cups long grain rice' },
  { kind: 'item', text: '3 cups chicken stock' },
  { kind: 'text', text: 'Melt the butter in a saucepan and soften the onion. Stir in the rice, add the stock, and simmer covered for 18 minutes.' },
]

// Fixture 2: PDF text after two-column reading, no styling, no labels, wrapped steps.
const pdfPage: Block[] = [
  { kind: 'text', text: 'Simple Tomato Soup', loc: 'p. 42' },
  { kind: 'text', text: '2 tbsp butter' },
  { kind: 'text', text: '1 onion, diced' },
  { kind: 'text', text: '2 (28-ounce) cans whole peeled tomatoes' },
  { kind: 'text', text: '2 cups vegetable stock' },
  { kind: 'text', text: '½ cup heavy cream' },
  { kind: 'text', text: 'Melt the butter in a pot over medium heat and cook the onion until soft, about 8 minutes.' },
  { kind: 'text', text: 'Add the tomatoes and stock, simmer 20 minutes, then blend until smooth and stir in the cream.' },
]

// Fixture 3: OCR-ish text with noise and a missing title style.
const ocrPage: Block[] = [
  { kind: 'text', text: 'BANANA BREAD', loc: 'p. 7 (OCR)' },
  { kind: 'text', text: '3 ripe bananas, mashed' },
  { kind: 'text', text: '1/3 cup melted butter' },
  { kind: 'text', text: '3/4 cup sugar' },
  { kind: 'text', text: '1 egg, beaten' },
  { kind: 'text', text: '1 tsp baking soda' },
  { kind: 'text', text: '1 1/2 cups all-purpose flour' },
  { kind: 'text', text: 'Mix the bananas and butter, then the sugar, egg and vanilla. Stir in the soda and flour. Bake 1 hour at 350F.' },
]

describe('recipe extraction', () => {
  it('reads labelled recipes from an EPUB chapter and skips the chapter intro', () => {
    const { recipes, carry } = extractRecipes(epubChapter, true)
    expect(carry).toEqual([])
    expect(recipes.map((r) => r.title)).toEqual(['Lemon Garlic Chicken', 'Rice Pilaf'])
    const [chicken, pilaf] = recipes
    expect(chicken.servings).toBe(4)
    expect(chicken.prepMinutes).toBe(10)
    expect(chicken.cookMinutes).toBe(25)
    expect(chicken.items.map((i) => i.key)).toEqual(['chicken thigh', 'olive oil', 'garlic', 'lemon', expect.any(String)])
    expect(chicken.steps).toHaveLength(3)
    expect(chicken.steps[0]).toBe('Pat the chicken dry and season with salt and pepper.')
    expect(chicken.confidence).toBeGreaterThanOrEqual(0.8)
    expect(chicken.loc).toBe('Chapter 3')
    expect(pilaf.servings).toBe(6)
    expect(pilaf.items).toHaveLength(4)
    expect(pilaf.steps).toHaveLength(1)
  })

  it('finds an unlabelled recipe in plain PDF text', () => {
    const { recipes } = extractRecipes(pdfPage, true)
    expect(recipes).toHaveLength(1)
    expect(recipes[0].title).toBe('Simple Tomato Soup')
    expect(recipes[0].items.map((i) => i.key)).toEqual(['butter', 'onion', 'canned tomato', 'vegetable stock', 'cream'])
    expect(recipes[0].steps).toHaveLength(2)
    expect(recipes[0].confidence).toBeGreaterThanOrEqual(0.6)
  })

  it('reads OCR-style text', () => {
    const { recipes } = extractRecipes(ocrPage, true)
    expect(recipes[0].title).toBe('BANANA BREAD')
    expect(recipes[0].items).toHaveLength(6)
  })

  it('carries an unfinished recipe to the next chunk, and finishes it there', () => {
    const first = extractRecipes(epubChapter.slice(0, 13), false)
    expect(first.recipes).toEqual([])
    expect(first.carry[0].text).toBe('Lemon Garlic Chicken')
    const second = extractRecipes([...first.carry, ...epubChapter.slice(13)], true)
    expect(second.recipes.map((r) => r.title)).toEqual(['Lemon Garlic Chicken', 'Rice Pilaf'])
    expect(second.recipes[0].steps).toHaveLength(3)
  })

  it('flags thin recipes for review instead of dropping them', () => {
    const thin: Block[] = [
      { kind: 'heading', text: 'Dressing' },
      { kind: 'text', text: 'Ingredients' },
      { kind: 'text', text: 'olive oil' },
      { kind: 'text', text: 'Shake together.' },
    ]
    const { recipes } = extractRecipes(thin, true)
    expect(recipes).toHaveLength(1)
    expect(recipes[0].confidence).toBeLessThan(0.6)
  })

  it('ignores prose that has no ingredients', () => {
    const essay: Block[] = [
      { kind: 'heading', text: 'About This Book' },
      { kind: 'text', text: 'I learned to cook in my grandmother’s kitchen, standing on a chair.' },
      { kind: 'text', text: 'Every recipe here has been tested many times.' },
    ]
    expect(extractRecipes(essay, true).recipes).toEqual([])
  })
})
