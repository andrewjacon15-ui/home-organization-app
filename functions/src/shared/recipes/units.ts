/** Kitchen units: canonical name → spellings. Matched case-insensitively, longest spelling first. */
export const UNITS: Record<string, string[]> = {
  tsp: ['teaspoons', 'teaspoon', 'tsps', 'tsp', 't'],
  tbsp: ['tablespoons', 'tablespoon', 'tbsps', 'tbsp', 'tbs', 'tbl', 'T'],
  cup: ['cups', 'cup', 'c'],
  'fl oz': ['fluid ounces', 'fluid ounce', 'fl. oz', 'fl oz', 'floz'],
  oz: ['ounces', 'ounce', 'oz'],
  lb: ['pounds', 'pound', 'lbs', 'lb'],
  g: ['grams', 'gram', 'gr', 'g'],
  kg: ['kilograms', 'kilogram', 'kgs', 'kg'],
  ml: ['milliliters', 'millilitres', 'milliliter', 'millilitre', 'ml'],
  l: ['liters', 'litres', 'liter', 'litre', 'l'],
  pint: ['pints', 'pint', 'pt'],
  quart: ['quarts', 'quart', 'qt'],
  gallon: ['gallons', 'gallon', 'gal'],
  pinch: ['pinches', 'pinch'],
  dash: ['dashes', 'dash'],
  clove: ['cloves', 'clove'],
  can: ['cans', 'can', 'tins', 'tin'],
  jar: ['jars', 'jar'],
  package: ['packages', 'package', 'pkgs', 'pkg', 'packets', 'packet'],
  stick: ['sticks', 'stick'],
  bunch: ['bunches', 'bunch'],
  sprig: ['sprigs', 'sprig'],
  slice: ['slices', 'slice'],
  piece: ['pieces', 'piece'],
  head: ['heads', 'head'],
  handful: ['handfuls', 'handful'],
  stalk: ['stalks', 'stalk'],
  fillet: ['fillets', 'fillet'],
  sheet: ['sheets', 'sheet'],
  bag: ['bags', 'bag'],
  box: ['boxes', 'box'],
  bottle: ['bottles', 'bottle'],
  drop: ['drops', 'drop'],
}

/** Units that only make sense before a noun ("1 c" is risky: "c" matches only when followed by a space and a word). */
const AMBIGUOUS = new Set(['t', 'T', 'c', 'l', 'g'])

const SPELLINGS: { text: string; unit: string }[] = Object.entries(UNITS)
  .flatMap(([unit, list]) => list.map((text) => ({ text, unit })))
  .sort((a, b) => b.text.length - a.text.length)

/** Reads a unit at the start of `s` ("cups flour" → cup). Returns the canonical unit and characters used. */
export function readUnit(s: string): { unit: string; length: number } | null {
  for (const { text, unit } of SPELLINGS) {
    const caseSensitive = text === 'T' || text === 't'
    const head = s.slice(0, text.length)
    const same = caseSensitive ? head === text : head.toLowerCase() === text.toLowerCase()
    if (!same) continue
    const next = s.slice(text.length)
    // A unit must end at a word boundary; "T" only as tablespoon when written capital.
    if (/^[a-z]/i.test(next)) continue
    if (AMBIGUOUS.has(text) && !/^\.?\s+\S/.test(next)) continue
    const dot = next.startsWith('.') ? 1 : 0
    return { unit, length: text.length + dot }
  }
  return null
}
