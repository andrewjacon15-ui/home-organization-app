/**
 * Ingredient lines → { qty, unit, name, note, key }:
 *   "1 1/2 cups finely chopped onion" → 1.5 cup "onion" (note "finely chopped", key "onion")
 *   "2 (14-ounce) cans diced tomatoes, drained" → 2 can "diced tomatoes" (note "14-ounce, drained")
 *   "Salt and pepper, to taste" → "salt and pepper" (note "to taste")
 */
import { familyOf, foldAccents, lookupPhrase, maxPhraseWords, singular } from './dictionary.js'
import { normalizeFractions, readQuantity } from './quantity.js'
import { readUnit } from './units.js'

export interface Ingredient {
  raw: string
  qty: number | null
  qtyMax: number | null
  unit: string | null
  name: string
  note: string
  /** Dictionary key ("chicken thigh"), or a best-effort singular noun phrase when unknown. */
  key: string
  /** Broader family ("chicken"); equals key when it has none. */
  family: string
  /** The name matched the ingredient dictionary. */
  known: boolean
}

/** Preparation words that describe how, not what ("finely chopped onion" → onion, note "finely chopped"). */
const PREP = new Set(
  `chopped minced diced sliced grated shredded peeled crushed cubed halved quartered trimmed seeded cored pitted
   softened melted beaten whisked sifted toasted roasted drained rinsed thawed cooked uncooked divided packed
   julienned zested juiced squeezed torn picked ground cracked smashed mashed cut crumbled warmed chilled
   finely roughly coarsely thinly thickly lightly freshly very well firmly loosely about approximately`
    .split(/\s+/)
    .filter(Boolean),
)
const SIZES = new Set(['large', 'medium', 'small', 'extra-large', 'jumbo', 'heaping', 'scant', 'level', 'generous', 'big'])
const TAIL_NOTES = /\b(to taste|to serve|for (?:garnish|serving|the pan|greasing|dusting|frying)|optional|plus more.*|or more.*|as needed|at room temperature|room temperature)\s*$/i

/** Strips list bullets and checkboxes. */
export function cleanLine(raw: string): string {
  return normalizeFractions(raw)
    .replace(/^[\s•·◦▪▫■□▢☐✓✔*–-]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseIngredient(raw: string): Ingredient {
  let s = cleanLine(raw)
  const notes: string[] = []

  const q = readQuantity(s)
  let qty: number | null = null
  let qtyMax: number | null = null
  if (q) {
    qty = q.value
    qtyMax = q.max
    s = s.slice(q.length).trim()
  }

  // "(14-ounce)" or "(400 g)" right after the number describes the package.
  const size = /^\(([^)]*)\)\s*/.exec(s)
  if (size) {
    notes.push(size[1].trim())
    s = s.slice(size[0].length)
  }
  // "x 400g" multipliers
  s = s.replace(/^x\s+/i, '')

  // Size words before the unit ("2 large cloves garlic")
  const sizeWords: string[] = []
  for (;;) {
    const m = /^([a-z-]+)\s+/i.exec(s)
    if (m && SIZES.has(m[1].toLowerCase())) {
      sizeWords.push(m[1].toLowerCase())
      s = s.slice(m[0].length)
    } else break
  }

  let unit: string | null = null
  const u = readUnit(s)
  if (u) {
    unit = u.unit
    s = s.slice(u.length).trim()
    s = s.replace(/^of\s+/i, '')
  }
  // "1 cup plus 2 tablespoons sugar" → keep the first amount; the extra goes to the note.
  const plus = /^plus\s+[\d½⅓⅔¼¾/ .-]+\s*\S+\s+/i.exec(s)
  if (plus) {
    notes.push(plus[0].trim())
    s = s.slice(plus[0].length)
  }

  // Parentheticals are notes, kept in the order written: "½ cup (1 stick) butter, softened".
  const comma = indexOutsideParens(s, ',')
  let name = comma >= 0 ? s.slice(0, comma) : s
  name = name.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    notes.push(inner.trim())
    return ' '
  })
  // A comma (outside parentheses) separates the name from how it's prepared.
  if (comma >= 0) notes.push(s.slice(comma + 1).trim())
  const tail = TAIL_NOTES.exec(name)
  if (tail) {
    notes.push(tail[1].trim())
    name = name.slice(0, tail.index)
  }

  // Leading prep and size words move to the note: "finely chopped fresh parsley" → parsley.
  const words = name.trim().split(/\s+/).filter(Boolean)
  const lead: string[] = []
  while (words.length > 1 && (PREP.has(words[0].toLowerCase().replace(/,$/, '')) || SIZES.has(words[0].toLowerCase()) || /ly$/.test(words[0].toLowerCase()))) {
    lead.push(words.shift()!)
  }
  name = words.join(' ').replace(/^(?:and|of)\s+/i, '').replace(/[.;:]+$/, '').trim()

  // Some foods are named by a prep word ("ground beef", "diced tomatoes"): if the full phrase
  // is a different, more specific dictionary entry, keep it whole.
  if (lead.length) {
    const full = [...lead, name].join(' ')
    const whole = ingredientKey(full)
    if (whole.known && whole.key !== ingredientKey(name).key) {
      name = full
      lead.length = 0
    }
  }

  const note = [...sizeWords, lead.join(' '), ...notes]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(', ')
  const { key, known } = ingredientKey(name)
  return { raw: raw.trim(), qty, qtyMax, unit, name, note, key, family: familyOf(key), known }
}

function indexOutsideParens(s: string, ch: string): number {
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') depth = Math.max(0, depth - 1)
    else if (s[i] === ch && depth === 0) return i
  }
  return -1
}

/** Words that never identify an ingredient on their own. */
const FILLER = new Set(['fresh', 'dried', 'organic', 'raw', 'whole', 'boneless', 'skinless', 'bone-in', 'skin-on', 'low-sodium', 'reduced-fat', 'unsalted', 'salted', 'ripe', 'frozen', 'canned', 'store-bought', 'homemade', 'good', 'quality', 'good-quality', 'extra', 'virgin', 'pure', 'plain', 'regular', 'additional', 'more', 'some', 'a', 'an', 'the', 'of', 'and', 'or', 'for', 'into', 'about', 'cup', 'cups'])

/**
 * The longest dictionary phrase inside a name ("boneless skinless chicken thighs" → "chicken thigh").
 * Unknown names fall back to their last one or two meaningful words, singular.
 */
export function ingredientKey(name: string): { key: string; known: boolean } {
  const tokens = foldAccents(name)
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const max = maxPhraseWords()
  let best: { key: string; len: number; end: number } | null = null
  for (let n = Math.min(max, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const key = lookupPhrase(tokens.slice(i, i + n).join(' '))
      if (key && (!best || n > best.len || (n === best.len && i + n > best.end))) best = { key, len: n, end: i + n }
    }
    if (best) break
  }
  if (best) return { key: best.key, known: true }
  const meaningful = tokens.filter((t) => !FILLER.has(t) && !PREP.has(t))
  const tail = meaningful.slice(-2).map(singular).join(' ')
  return { key: tail || tokens.map(singular).join(' '), known: false }
}

/** How much a line looks like an ingredient (0–1): a quantity or unit up front, short, known food words. */
export function ingredientLikeness(line: string): number {
  const s = cleanLine(line)
  if (!s || s.length > 140) return 0
  let score = 0
  const q = readQuantity(s)
  // Word quantities ("a", "one") alone are weak evidence; digits are strong.
  if (q && /^[\d.]/.test(normalizeFractions(s))) score += 0.5
  else if (q) score += 0.15
  const rest = q ? s.slice(q.length).trim() : s
  if (readUnit(rest)) score += 0.25
  if (ingredientKey(rest.replace(/,.*/, '')).known) score += 0.25
  if (s.length < 70) score += 0.1
  // "Salt and pepper, to taste", "Basil, to serve": no amount, but clearly an ingredient.
  if (TAIL_NOTES.test(s)) score += 0.25
  // Sentences with verbs in the imperative read like steps, not ingredients.
  if (/^(add|stir|cook|bake|heat|mix|place|pour|combine|whisk|bring|preheat|remove|serve|let|cover|season|transfer|put|make|using|in a)\b/i.test(rest)) score -= 0.5
  if (/[.!?]\s+\S/.test(s)) score -= 0.3
  return Math.max(0, Math.min(1, score))
}
