/**
 * Shopping for several meals at once: the same ingredient from different recipes becomes
 * one grocery line ("1 cup rice" + "2 cups rice" → "3 cups rice"). Amounts add up only when
 * the units match; otherwise each amount gets its own line. Pantry staples and anything
 * already on the list are left out.
 */
import { familyOf, singularPhrase } from './dictionary.js'
import { parseIngredient } from './ingredient.js'
import { formatQuantity } from './quantity.js'

/** How a unit reads after an amount ("2 cups", "1 lb", "3 cloves"). */
const PLURAL: Record<string, string> = { cup: 'cups', pint: 'pints', quart: 'quarts', gallon: 'gallons', pinch: 'pinches', dash: 'dashes', clove: 'cloves', can: 'cans', jar: 'jars', package: 'packages', stick: 'sticks', bunch: 'bunches', sprig: 'sprigs', slice: 'slices', piece: 'pieces', head: 'heads', handful: 'handfuls', stalk: 'stalks', fillet: 'fillets', sheet: 'sheets', bag: 'bags', box: 'boxes', bottle: 'bottles', drop: 'drops' }
const unitText = (unit: string, n: number) => (n > 1 && PLURAL[unit] ? PLURAL[unit] : unit)

/** '3 onion' → '3 onions', '2 tomato' → '2 tomatoes', '4 berry' → '4 berries' (only the last word). */
function plural(name: string): string {
  if (/s$/i.test(name)) return name
  if (/[^aeiou]y$/i.test(name)) return name.slice(0, -1) + 'ies'
  if (/(tomato|potato|mango)$/i.test(name)) return name + 'es'
  if (/(ch|sh|x)$/i.test(name)) return name + 'es'
  return name + 's'
}

export interface GroceryPlan {
  /** Lines to add, combined across recipes. */
  lines: string[]
  /** Ingredients skipped because they're pantry staples. */
  staples: string[]
  /** Ingredients skipped because the list already has them. */
  onList: string[]
}

interface Group {
  key: string
  unit: string | null
  qty: number
  /** Pieces without an amount ("salt to taste"). */
  bare: boolean
  name: string
  raws: string[]
}

/**
 * Combines ingredient lines from several recipes into grocery lines.
 * `staples` and `existing` are names or list item texts; they're matched by ingredient.
 */
export function groceryLines(ingredientLines: string[], staples: string[] = [], existing: string[] = []): GroceryPlan {
  const keyOf = (text: string) => parseIngredient(text).key
  const stapleKeys = new Set(staples.map((s) => singularPhrase(s.toLowerCase().trim())))
  const listed = new Set(existing.map(keyOf).filter(Boolean))
  const groups = new Map<string, Group>()
  const skippedStaples = new Set<string>()
  const skippedListed = new Set<string>()

  for (const raw of ingredientLines) {
    const line = raw.trim()
    if (!line || /:\s*$/.test(line)) continue // "For the sauce:"
    const ing = parseIngredient(line)
    const key = ing.key || line.toLowerCase()
    if (stapleKeys.has(key) || stapleKeys.has(familyOf(key))) {
      skippedStaples.add(key)
      continue
    }
    if (listed.has(key)) {
      skippedListed.add(key)
      continue
    }
    const id = `${key}|${ing.qty == null ? '-' : (ing.unit ?? '')}`
    const g = groups.get(id)
    if (g) {
      g.qty += ing.qty ?? 0
      g.raws.push(line)
    } else {
      groups.set(id, { key, unit: ing.unit, qty: ing.qty ?? 0, bare: ing.qty == null, name: ing.name || line, raws: [line] })
    }
  }

  const lines = [...groups.values()].map((g) => {
    // One mention keeps its own wording; several are rewritten as a total.
    if (g.raws.length === 1 || g.bare) return g.raws[0]
    const amount = formatQuantity(g.qty)
    return [amount, g.unit ? unitText(g.unit, g.qty) : null, !g.unit && g.qty > 1 ? plural(g.name) : g.name].filter(Boolean).join(' ')
  })
  return { lines, staples: [...skippedStaples], onList: [...skippedListed] }
}
