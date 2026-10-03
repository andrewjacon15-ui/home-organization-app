import { describe, expect, it } from 'vitest'
import { parseIngredient } from './ingredient.js'
import { bayesianRating, listFromSpeech, matchRecipe, onlineScore, popularity, rankByMatch, searchScore, tokenizeHave } from './matcher.js'

/** A fixture recipe as the catalog index stores it: ingredient keys and families. */
function recipe(t: string, lines: string[], f = false) {
  const items = lines.map((l) => parseIngredient(l))
  return { t, f, k: items.map((i) => i.key), fa: items.map((i) => i.family) }
}

const tacos = recipe('Chicken Tacos', ['1 lb chicken thighs', '8 corn tortillas', '1 lime', '1/4 cup cilantro', '1 tsp cumin', 'salt', '2 tbsp olive oil'])
const friedRice = recipe('Fried Rice', ['3 cups cooked rice', '2 eggs', '1 cup frozen peas', '2 scallions', '2 tbsp soy sauce', '1 tbsp vegetable oil'])
const pancakes = recipe('Pancakes', ['1 1/2 cups flour', '1 tbsp sugar', '2 tsp baking powder', '1 1/4 cups milk', '1 egg'], true)
const stew = recipe('Beef Stew', ['2 lb beef chuck', '4 carrots', '3 potatoes', '1 onion', '2 cups beef broth'])

describe('tokenizeHave', () => {
  it('reads a spoken or typed list into dictionary keys', () => {
    const have = tokenizeHave('I have chicken thighs, some rice and a couple of eggs. Also scallions & 2 limes')
    expect(have.map((h) => h.key)).toEqual(['chicken thigh', 'rice', 'egg', 'green onion', 'lime'])
  })

  it('drops quantities and duplicates', () => {
    expect(tokenizeHave('2 cups rice\nrice\n1 lb ground beef').map((h) => h.key)).toEqual(['rice', 'ground beef'])
    expect(tokenizeHave('')).toEqual([])
  })
})

describe('listFromSpeech', () => {
  it('puts commas between the foods in a run-on spoken phrase', () => {
    expect(listFromSpeech('chicken thighs rice broccoli')).toBe('chicken thighs, rice, broccoli')
    expect(listFromSpeech('ground beef olive oil tomatoes onion')).toBe('ground beef, olive oil, tomatoes, onion')
  })

  it('keeps unknown words with their food and respects breaks already there', () => {
    expect(listFromSpeech('I have 2 cups rice some frozen peas and eggs')).toBe('I have 2 cups rice, some frozen peas, eggs')
    expect(listFromSpeech('Chicken, rice.')).toBe('Chicken, rice')
    expect(listFromSpeech('')).toBe('')
  })

  it('reads back into the same ingredients', () => {
    expect(tokenizeHave(listFromSpeech('chicken thighs rice spring onions eggs')).map((h) => h.key)).toEqual(['chicken thigh', 'rice', 'green onion', 'egg'])
  })
})

describe('matchRecipe', () => {
  it('counts what they have, lists what is missing, and ignores staples', () => {
    const r = matchRecipe(tacos.k, tacos.fa, tokenizeHave('chicken, tortillas, lime'))
    expect(r.have).toEqual(['chicken thigh', 'tortilla', 'lime'])
    expect(r.missing).toEqual(['cilantro', 'cumin'])
    expect(r.staples).toEqual(['salt', 'olive oil'])
    expect(r.match).toBeCloseTo(3 / 5)
  })

  it('matches synonyms, plurals, families, and typos of unknown words', () => {
    // "spring onion" = green onion (synonym); "egg" covers "eggs"; "brocoli" is a typo.
    expect(matchRecipe(friedRice.k, friedRice.fa, tokenizeHave('spring onions, eggs, rice, peas, soy sauce')).match).toBe(1)
    const typo = matchRecipe(['broccoli'], ['broccoli'], tokenizeHave('brocoli'))
    expect(typo.have).toEqual(['broccoli'])
    // Known words never fuzzy-match a different food.
    expect(matchRecipe(['beef'], ['beef'], tokenizeHave('beets')).match).toBe(0)
    // Chicken stock is not chicken.
    expect(matchRecipe(['chicken stock'], ['stock'], tokenizeHave('chicken')).match).toBe(0)
    // A general word covers kinds, and a general ingredient accepts a kind; two different kinds don't swap.
    expect(matchRecipe(['ricotta'], ['cheese'], tokenizeHave('cheese')).match).toBe(1)
    expect(matchRecipe(['chicken'], ['chicken'], tokenizeHave('chicken thighs')).match).toBe(1)
    expect(matchRecipe(['cream cheese'], ['cheese'], tokenizeHave('ricotta')).match).toBe(0)
  })

  it('uses the family pantry list', () => {
    expect(matchRecipe(pancakes.k, pancakes.fa, tokenizeHave('milk, egg'), ['salt', 'pepper', 'flour', 'sugar', 'baking powder']).match).toBe(1)
    expect(matchRecipe(['salt'], ['salt'], [])).toMatchObject({ match: 1, staples: ['salt'] })
  })
})

describe('rankByMatch', () => {
  it('ranks by match, then fewer missing, then favorites; always returns the top 3', () => {
    const have = tokenizeHave('eggs, milk, rice')
    const ranked = rankByMatch([tacos, friedRice, pancakes, stew], (e) => matchRecipe(e.k, e.fa, have))
    expect(ranked.map((r) => r.item.t)).toEqual(['Pancakes', 'Fried Rice', 'Beef Stew'])
    expect(ranked).toHaveLength(3)
    // Nothing in common still returns three.
    expect(rankByMatch([tacos, friedRice, pancakes, stew], (e) => matchRecipe(e.k, e.fa, tokenizeHave('kumquats')))).toHaveLength(3)
  })
})

describe('ranking math', () => {
  it('Bayesian rating pulls small samples toward the 4.0 prior', () => {
    expect(bayesianRating(5, 3)).toBeCloseTo((50 * 4 + 3 * 5) / 53)
    expect(bayesianRating(4.7, 4000)).toBeCloseTo((50 * 4 + 4000 * 4.7) / 4050)
    expect(bayesianRating(4.7, 4000)).toBeGreaterThan(bayesianRating(5, 3))
    expect(bayesianRating(null, null)).toBe(4)
  })

  it('online score weighs match, popularity, and search position', () => {
    expect(onlineScore(1, { value: 5, count: 1e9 })).toBeCloseTo(1)
    expect(popularity(null)).toBeCloseTo(0.5)
    expect(onlineScore(0.5, null)).toBeCloseTo(0.3 + 0.25 * 0.5 + 0.15)
    expect(searchScore(1, 8)).toBe(1)
    expect(searchScore(8, 8)).toBe(0)
    // Searching for a dish: popularity and position only.
    expect(onlineScore(null, { value: 4.8, count: 5000 }, searchScore(3, 5))).toBeCloseTo(0.6 * popularity({ value: 4.8, count: 5000 }) + 0.4 * 0.5)
    // A full match with a modest rating beats a half match with a famous one.
    expect(onlineScore(1, { value: 4.2, count: 20 })).toBeGreaterThan(onlineScore(0.5, { value: 4.9, count: 10000 }))
  })
})
