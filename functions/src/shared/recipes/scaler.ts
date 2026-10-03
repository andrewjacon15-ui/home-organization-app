/**
 * Serving scaler: rewrites only the amount at the start of an ingredient line, in kitchen
 * fractions, and leaves the rest as the cook wrote it ("2 (14-ounce) cans tomatoes" × 2 →
 * "4 (14-ounce) cans tomatoes"). Lines without an amount ("Salt, to taste") stay as they are.
 * The word after the amount follows it: "1 cup" → "2 cups", "1 egg" → "2 eggs", "2 eggs" → "1 egg".
 */
import { singular } from './dictionary.js'
import { cleanLine } from './ingredient.js'
import { formatRange, readQuantity } from './quantity.js'
import { UNITS } from './units.js'

/** Abbreviations read the same for one or many ("2 tbsp", "3 lb"). */
const SAME = new Set(['tsp', 'tsps', 'tbsp', 'tbsps', 'tbs', 'tbl', 't', 'T', 'c', 'oz', 'fl oz', 'fl. oz', 'floz', 'lb', 'lbs', 'g', 'gr', 'kg', 'kgs', 'ml', 'l', 'pt', 'qt', 'gal', 'pkg', 'pkgs'])
const SPELLINGS = new Set(Object.values(UNITS).flat().filter((s) => !SAME.has(s)))

/** "cup" ↔ "cups", "pinch" ↔ "pinches", when both are spellings of the unit. */
function unitFor(word: string, many: boolean): string | null {
  const w = word.toLowerCase()
  if (!SPELLINGS.has(w)) return null
  if (many) return SPELLINGS.has(`${w}s`) ? `${word}s` : SPELLINGS.has(`${w}es`) ? `${word}es` : word
  if (w.endsWith('es') && SPELLINGS.has(w.slice(0, -2))) return word.slice(0, -2)
  if (w.endsWith('s') && SPELLINGS.has(w.slice(0, -1))) return word.slice(0, -1)
  return word
}

function nounFor(word: string, many: boolean): string {
  if (!/^[a-z]+$/i.test(word)) return word
  if (!many) return /s$/i.test(word) ? singular(word) : word
  if (/s$/i.test(word)) return word
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`
  if (/(ch|sh|x|o)$/i.test(word)) return `${word}es`
  return `${word}s`
}

/** Makes the unit, or a short name with no unit, agree with the new amount. */
function agree(rest: string, was: number, now: number): string {
  const wasMany = was > 1
  const many = now > 1
  if (wasMany === many) return rest
  const first = /^([A-Za-z]+)(\.?)(\s|$)/.exec(rest)
  if (first) {
    // Abbreviations (2 tbsp, 3 lb) read the same either way.
    if (SAME.has(first[1]) || SAME.has(first[1].toLowerCase())) return rest
    const unit = unitFor(first[1], many)
    if (unit != null) return unit + rest.slice(first[1].length)
  }
  // "1 egg", "1 large onion, diced": the last word of a short name (before any comma or note).
  const end = rest.search(/[,(;]/)
  const name = end < 0 ? rest : rest.slice(0, end)
  const words = name.trimEnd().split(' ')
  if (words.length > 3) return rest
  words[words.length - 1] = nounFor(words[words.length - 1], many)
  return words.join(' ') + rest.slice(name.trimEnd().length)
}

export function scaleLine(raw: string, factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 1e-9) return raw.trim()
  const s = cleanLine(raw)
  const q = readQuantity(s)
  if (!q) return raw.trim()
  const value = q.value * factor
  const max = q.max != null ? q.max * factor : null
  const amount = formatRange(value, max)
  const rest = s.slice(q.length).trim()
  return `${amount} ${agree(rest, q.max ?? q.value, max ?? value)}`.trim()
}

/** The factor from the recipe's servings to the servings wanted (1 when either is unknown). */
export function scaleFactor(base: number | null | undefined, wanted: number | null | undefined): number {
  return base && wanted && base > 0 && wanted > 0 ? wanted / base : 1
}
