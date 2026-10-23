/**
 * Shopping for several meals at once: the same ingredient from different recipes becomes one
 * grocery line. Amounts are converted before they're added, so "1 lb ground beef" and "8 oz
 * ground beef" make "1 1/2 lb ground beef", and "1 cup milk" with "4 tbsp milk" makes
 * "1 1/4 cups milk". Different wordings of the same food ("1 onion, diced", "2 onions") count
 * together. Counts round up to what you can buy. Pantry staples and anything already on the
 * list are left out.
 */
import { familyOf, singularPhrase } from './dictionary.js'
import { parseIngredient } from './ingredient.js'
import { formatQuantity } from './quantity.js'

/** How a unit reads after an amount ("2 cups", "1 lb", "3 cloves"). */
const PLURAL: Record<string, string> = { cup: 'cups', pint: 'pints', quart: 'quarts', gallon: 'gallons', pinch: 'pinches', dash: 'dashes', clove: 'cloves', can: 'cans', jar: 'jars', package: 'packages', stick: 'sticks', bunch: 'bunches', sprig: 'sprigs', slice: 'slices', piece: 'pieces', head: 'heads', handful: 'handfuls', stalk: 'stalks', fillet: 'fillets', sheet: 'sheets', bag: 'bags', box: 'boxes', bottle: 'bottles', drop: 'drops' }
const unitText = (unit: string, n: number) => (n > 1 && PLURAL[unit] ? PLURAL[unit] : unit)

/** Millilitres in each volume unit. */
const ML: Record<string, number> = { tsp: 4.929, tbsp: 14.787, 'fl oz': 29.574, cup: 236.59, pint: 473.18, quart: 946.35, gallon: 3785.4, ml: 1, l: 1000 }
/** Grams in each weight unit. */
const GRAMS: Record<string, number> = { oz: 28.35, lb: 453.59, g: 1, kg: 1000 }
const METRIC = new Set(['ml', 'l', 'g', 'kg'])

/** '3 onion' → '3 onions', '2 tomato' → '2 tomatoes', '4 berry' → '4 berries' (only the last word). */
function plural(name: string): string {
  if (/s$/i.test(name)) return name
  if (/[^aeiou]y$/i.test(name)) return name.slice(0, -1) + 'ies'
  if (/(tomato|potato|mango)$/i.test(name)) return name + 'es'
  if (/(ch|sh|x)$/i.test(name)) return name + 'es'
  return name + 's'
}

/** Rounds up to a step (1/4 cup, 1/2 tbsp), never to nothing. Within 2% counts as on the step (16 oz is 1.00003 lb). */
const roundUp = (n: number, step: number) => Math.max(step, Math.ceil(n / step - 0.02) * step)

/** A total volume in the unit a shopper reads best. */
function volumeText(ml: number, metric: boolean): [string, string] {
  if (metric) return ml >= 1000 ? [formatQuantity(roundUp(ml / 1000, 0.25)), 'l'] : [String(Math.ceil(ml / 10) * 10), 'ml']
  if (ml >= ML.cup * 0.99) {
    const n = roundUp(ml / ML.cup, 0.25)
    return [formatQuantity(n), unitText('cup', n)]
  }
  if (ml >= ML.tbsp * 0.99) return [formatQuantity(roundUp(ml / ML.tbsp, 0.5)), 'tbsp']
  return [formatQuantity(roundUp(ml / ML.tsp, 0.25)), 'tsp']
}

/** A total weight in the unit a shopper reads best. */
function weightText(g: number, metric: boolean): [string, string] {
  if (metric) return g >= 1000 ? [formatQuantity(roundUp(g / 1000, 0.25)), 'kg'] : [String(Math.ceil(g / 25) * 25), 'g']
  if (g >= GRAMS.lb * 0.99) return [formatQuantity(roundUp(g / GRAMS.lb, 0.25)), 'lb']
  return [String(Math.ceil(g / GRAMS.oz - 1e-9)), 'oz']
}

/** An ingredient line, and (optionally) the meal it's for ("Tue: Tacos"). */
export type GroceryInput = string | { text: string; source?: string }

export interface GroceryLine {
  line: string
  /** The meals that asked for it, in order (empty when none were given). */
  sources: string[]
}

export interface GroceryPlan {
  /** Lines to add, combined across recipes. */
  lines: string[]
  /** The same lines, each with the meals that asked for it. */
  details: GroceryLine[]
  /** Ingredients skipped because they're pantry staples. */
  staples: string[]
  /** Ingredients skipped because the list already has them. */
  onList: string[]
}

interface Group {
  key: string
  name: string
  raws: string[]
  sources: string[]
  /** Amounts added up by kind: volume in ml, weight in g, plain counts, and counts of a unit ("cans"). */
  ml: number
  g: number
  count: number
  units: Map<string, number>
  metric: boolean
  /** Some mention had an amount (a bare "salt to taste" alongside adds nothing). */
  measured: boolean
}

/**
 * Combines ingredient lines from several recipes into grocery lines.
 * `staples` and `existing` are names or list item texts; they're matched by ingredient.
 */
export function groceryLines(ingredientLines: GroceryInput[], staples: string[] = [], existing: string[] = []): GroceryPlan {
  const keyOf = (text: string) => parseIngredient(text).key
  const stapleKeys = new Set(staples.map((s) => singularPhrase(s.toLowerCase().trim())))
  const listed = new Set(existing.map(keyOf).filter(Boolean))
  const groups = new Map<string, Group>()
  const skippedStaples = new Set<string>()
  const skippedListed = new Set<string>()

  for (const input of ingredientLines) {
    const line = (typeof input === 'string' ? input : input.text).trim()
    const source = typeof input === 'string' ? undefined : input.source
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
    let g = groups.get(key)
    if (!g) {
      g = { key, name: ing.name || line, raws: [], sources: [], ml: 0, g: 0, count: 0, units: new Map(), metric: true, measured: false }
      groups.set(key, g)
    }
    g.raws.push(line)
    if (source && !g.sources.includes(source)) g.sources.push(source)
    // A range ("2-3 cloves") is shopped at its top.
    const qty = ing.qtyMax ?? ing.qty
    if (qty == null) continue
    g.measured = true
    const unit = ing.unit
    if (unit && ML[unit]) g.ml += qty * ML[unit]
    else if (unit && GRAMS[unit]) g.g += qty * GRAMS[unit]
    else if (unit) g.units.set(unit, (g.units.get(unit) ?? 0) + qty)
    else g.count += qty
    if (unit && (ML[unit] || GRAMS[unit]) && !METRIC.has(unit)) g.metric = false
  }

  const details: GroceryLine[] = [...groups.values()].map((g) => {
    // One mention keeps its own wording, unless it's part of something you buy whole (a recipe
    // scaled for more people asks for 1 1/2 lemons); so do mentions without amounts.
    const whole = (n: number) => Math.abs(n - Math.round(n)) < 1e-9
    const partCount = !g.ml && !g.g && ((g.count > 0 && !whole(g.count)) || [...g.units.values()].some((n) => !whole(n)))
    if ((g.raws.length === 1 && !partCount) || !g.measured) return { line: g.raws[0], sources: g.sources }
    const parts: string[] = []
    if (g.ml) parts.push(volumeText(g.ml, g.metric).join(' '))
    if (g.g) parts.push(weightText(g.g, g.metric).join(' '))
    for (const [unit, n] of g.units) {
      const whole = Math.ceil(n - 1e-9)
      parts.push(`${whole} ${unitText(unit, whole)}`)
    }
    if (g.count) {
      // You can't buy 1.33 onions.
      const whole = Math.ceil(g.count - 1e-9)
      return { line: [...parts.map((p) => `${p} +`), `${whole} ${whole > 1 ? plural(g.name) : g.name}`].join(' '), sources: g.sources }
    }
    return { line: `${parts.join(' + ')} ${g.name}`, sources: g.sources }
  })
  return { lines: details.map((d) => d.line), details, staples: [...skippedStaples], onList: [...skippedListed] }
}
