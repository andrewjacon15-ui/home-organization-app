/**
 * Grocery aisles: which store section a list item belongs in, by the same ingredient
 * dictionary the recipes use ("scallions" → Produce, "chicken thighs" → Meat & Seafood).
 */
import { parseIngredient } from './ingredient.js'

export const AISLES = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Frozen', 'Household'] as const
export type Aisle = (typeof AISLES)[number]

const PRODUCE = new Set(
  `onion garlic ginger tomato cherry tomato potato sweet potato carrot celery bell pepper chili pepper zucchini eggplant cucumber
   mushroom spinach kale lettuce arugula cabbage broccoli cauliflower brussels sprout asparagus green bean avocado beet radish
   squash fennel artichoke okra bok choy lemon lime orange apple banana berry grape peach pear plum cherry mango pineapple
   basil parsley cilantro mint dill thyme rosemary sage chive tarragon`
    .split(/\s{2,}|\n/)
    .flatMap((l) => l.trim().split(' '))
    .filter(Boolean),
)
// Multi-word produce keys (the split above handles single words).
const PRODUCE_KEYS = new Set(['cherry tomato', 'sweet potato', 'bell pepper', 'chili pepper', 'brussels sprout', 'green bean', 'bok choy', 'green onion', 'red onion'])
const MEAT = new Set(['chicken', 'beef', 'pork', 'lamb', 'turkey', 'fish', 'seafood'])
const DAIRY = new Set(['milk', 'buttermilk', 'cream', 'half and half', 'sour cream', 'creme fraiche', 'yogurt', 'butter', 'ghee', 'cheese', 'egg'])
const BAKERY = new Set(['bread', 'tortilla', 'pita'])
const NOT_PANTRY_FRESH = new Set(['canned tomato', 'tomato paste', 'tomato sauce', 'coconut milk'])
const HOUSEHOLD = /\b(paper towels?|toilet paper|tissues?|napkins?|detergent|soap|dish ?soap|sponges?|trash bags?|garbage bags?|foil|plastic wrap|cling film|zip ?locks?|batteries|light ?bulbs?|shampoo|conditioner|toothpaste|deodorant|bleach|cleaner|wipes|diapers?)\b/i

/** The aisle for an item's text, or null when it isn't recognized. */
export function aisleFor(text: string): Aisle | null {
  if (HOUSEHOLD.test(text)) return 'Household'
  if (/\bfrozen\b|\bice cream\b/i.test(text)) return 'Frozen'
  const ing = parseIngredient(text)
  if (!ing.known) return null
  const { key, family } = ing
  if (NOT_PANTRY_FRESH.has(key)) return 'Pantry'
  if (MEAT.has(family) || MEAT.has(key)) return 'Meat & Seafood'
  if (DAIRY.has(family) || DAIRY.has(key)) return 'Dairy & Eggs'
  if (BAKERY.has(key)) return 'Bakery'
  if (PRODUCE.has(key) || PRODUCE_KEYS.has(key) || PRODUCE.has(family) || family === 'onion' || family === 'berry' || (family === 'tomato' && key === 'tomato')) return 'Produce'
  return 'Pantry'
}

/** Picks the matching category (by name, any case) for an item, if the list has that aisle. */
export function categoryFor(text: string, categories: { id: string; name: string }[]): string | null {
  if (!categories.length) return null
  const aisle = aisleFor(text)
  if (!aisle) return null
  return categories.find((c) => c.name.trim().toLowerCase() === aisle.toLowerCase())?.id ?? null
}
