/**
 * Rule-based recipe extraction from a stream of text blocks (EPUB chapters or PDF pages,
 * already turned into headings / paragraphs / list items). No AI: headings and labels mark
 * boundaries, quantity-led lines are ingredients, the rest are steps.
 */
import { ingredientLikeness, parseIngredient, type Ingredient } from './ingredient.js'

export interface Block {
  kind: 'heading' | 'text' | 'item'
  text: string
  /** Heading level, 1 = biggest. PDFs derive it from font size. */
  level?: number
  /** Where it came from ("p. 112", "Chapter 4"), for review. */
  loc?: string
}

export interface ExtractedRecipe {
  title: string
  /** One line per ingredient, group labels ("For the sauce:") included. */
  ingredientLines: string[]
  items: Ingredient[]
  steps: string[]
  yieldText: string | null
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  totalMinutes: number | null
  confidence: number
  loc: string | null
  /** The cook's notes printed with the recipe ("Crowd pleaser!", "Serve warm"). */
  notes: string[]
  /** Who the recipe is from ("Recipe by Karen" → "Karen"). */
  credit: string | null
  /** The chapter it sits in ("Desserts", "Main dish: Beef"), when the book has chapter pages. */
  chapter: string | null
}

const INGREDIENTS_LABEL = /^(ingredients?|you will need|you'll need|what you need)\s*:?$/i
const METHOD_LABEL = /^(method|directions?|instructions?|preparation|steps|procedure|to (make|prepare|serve))\s*:?$/i
const GROUP_LABEL = /^(for the .{2,40}|.{2,40}:)$/i
const YIELD = /^(?:serves|servings?|makes|yields?|portions?|feeds)\b\s*:?\s*(.{1,60})$/i
const TIME = /\b(prep(?:aration)?|cook(?:ing)?|baking|total|active|ready in|start to finish)\s*(?:time)?\s*:?\s*((?:\d+\s*(?:-\s*\d+\s*)?(?:hours?|hrs?|h|minutes?|mins?|m)\b\s*(?:and\s*)?)+)/gi
const STEP_NUMBER = /^\s*(?:step\s*)?(\d{1,2})[.):]\s+/i
const CREDIT = /^(?:recipe (?:by|from|courtesy of)|submitted by|courtesy of|from the kitchen of|contributed by)\s*:?\s+(.{2,60})$/i

/** Minutes in "1 hour 15 minutes", "1 h 15 m", "45 mins", "20-25 minutes" (uses the high end). */
export function parseMinutes(text: string): number | null {
  let total = 0
  let found = false
  for (const m of text.matchAll(/(\d+)\s*(?:-\s*(\d+)\s*)?(hours?|hrs?|h|minutes?|mins?|m)\b/gi)) {
    const n = +(m[2] ?? m[1])
    total += /^h/i.test(m[3]) ? n * 60 : n
    found = true
  }
  return found ? total : null
}

function isTitleCandidate(b: Block, next: Block[], headingsOnly: boolean): boolean {
  const t = b.text.trim()
  if (t.length < 3 || t.length > 90) return false
  // Titles start with a letter, digit, or quote, never stray OCR punctuation like "[" or "|".
  if (/^[^\p{L}\p{N}"'“‘]/u.test(t)) return false
  if (INGREDIENTS_LABEL.test(t) || METHOD_LABEL.test(t) || YIELD.test(t) || /^for the\b/i.test(t) || t.endsWith(':')) return false
  TIME.lastIndex = 0
  if (TIME.test(t)) return false
  // A styled title can start with a number ("7-Layer Taco Dip"); a plain line that does is an ingredient.
  if (!(b.kind === 'heading' && headingsOnly) && ingredientLikeness(t) >= 0.5) return false
  if (b.kind === 'heading') return true
  if (headingsOnly) return false
  // An un-styled short line (common in PDFs) counts if a recipe clearly follows it.
  if (b.kind === 'text' && t.length <= 70 && !/[.!?]$/.test(t)) {
    const soon = next.slice(0, 5)
    const labelled = soon.some((x) => INGREDIENTS_LABEL.test(x.text.trim()))
    const run = soon.filter((x) => ingredientLikeness(x.text) >= 0.5).length
    return labelled || run >= 2
  }
  return false
}

/**
 * Whether this text styles its recipe titles as headings: at least two headings are followed
 * closely by an ingredient list (or an "Ingredients" label). A book whose big headings are
 * only chapter names, with recipe titles in bold body text, doesn't count.
 */
const usesHeadings = (blocks: Block[]) => {
  let n = 0
  blocks.forEach((b, i) => {
    if (b.kind !== 'heading') return
    const soon = blocks.slice(i + 1, i + 7).filter((x) => x.kind !== 'heading' || INGREDIENTS_LABEL.test(x.text.trim()))
    if (soon.some((x) => INGREDIENTS_LABEL.test(x.text.trim())) || soon.filter((x) => ingredientLikeness(x.text) >= 0.5).length >= 2) n++
  })
  return n >= 2
}

const STEP_VERB = /^(add|stir|cook|bake|heat|mix|place|pour|combine|whisk|bring|preheat|remove|serve|let|cover|season|transfer|put|make|using|in a|dump|cut|chop|slice|blend|fry|grill|roast|boil|simmer|melt|spread|layer|toss|beat|fold|roll|wrap|soak|marinate|brown|saute|sauté|drain|rinse|peel|arrange|sprinkle|dissolve|cream|line|grease|spray)\b/i
/** A method sentence: long, more than one sentence, or an instruction. */
const isProse = (t: string) => t.length > 90 || /[.!?]\s+\S/.test(t) || (STEP_VERB.test(t) && /[.!]$/.test(t))
/** A cook's note above the ingredients: a sentence or remark, not a short item. */
const isNote = (t: string) => {
  const words = t.trim().split(/\s+/).length
  return words > 9 || (words > 4 && /[.!?"”)]$/.test(t.trim())) || (/^[^:]{2,20}:\s+\S/.test(t) && ingredientLikeness(t) < 0.5)
}

/** Splits blocks into sections that each start at a title candidate. */
function sections(blocks: Block[]): Block[][] {
  const out: Block[][] = []
  let current: Block[] = []
  // A book that styles its titles as headings doesn't need plain lines guessed as titles
  // (those guesses turn an ingredient like "Salt and pepper" into a new recipe).
  const headingsOnly = usesHeadings(blocks)
  blocks.forEach((b, i) => {
    if (isTitleCandidate(b, blocks.slice(i + 1), headingsOnly) && current.length) {
      out.push(current)
      current = []
    }
    current.push(b)
  })
  if (current.length) out.push(current)
  return out
}

/** Paragraphs that number their own steps inline ("1. Heat… 2. Add…") become separate steps. */
function splitSteps(texts: string[]): string[] {
  const out: string[] = []
  for (const t of texts) {
    const parts = t.split(/\s+(?=\d{1,2}[.)]\s+[A-Z])/)
    for (const p of parts) {
      const s = p.replace(STEP_NUMBER, '').trim()
      if (s) out.push(s)
    }
  }
  return out
}

const ABBREVIATION = /\b(?:approx|tbsp?|tbs|tsp|oz|lbs?|pkg|qt|pt|min|mins|hr|hrs|no|st|dr|mr|mrs|ms|vs|e\.g|i\.e|ca)\.$/i

/** Sentences, not split after abbreviations like "approx." or "Tbs.". */
export function sentences(text: string): string[] {
  const out: string[] = []
  for (const piece of text.split(/(?<=[.!?])\s+(?=["“(]?[A-Z])/)) {
    if (out.length && ABBREVIATION.test(out[out.length - 1])) out[out.length - 1] += ` ${piece}`
    else out.push(piece)
  }
  return out.map((x) => x.trim()).filter(Boolean)
}

/**
 * A method printed as one or two long paragraphs reads badly one step at a time, so it's
 * split into sentences; a short sentence ("Mix well.") stays with the one before it.
 * Methods already written as several steps are left alone.
 */
export function stepsForCooking(steps: string[]): string[] {
  const long = steps.reduce((n, x) => n + x.length, 0)
  if (steps.length > 2 || long < 220) return steps
  const out: string[] = []
  for (const step of steps) {
    for (const sentence of sentences(step)) {
      if (out.length && (out[out.length - 1].length < 30 || sentence.length < 25) && out[out.length - 1].length + sentence.length < 160) out[out.length - 1] += ` ${sentence}`
      else out.push(sentence)
    }
  }
  return out
}

function recipeFrom(section: Block[], chapter: string | null, headingsOnly = false): ExtractedRecipe | null {
  const [head, ...printed] = section
  // "Yield: 6 servings | Recipe by Georgiann" is two facts on one line.
  const body = printed.flatMap((b) => (b.kind === 'heading' ? [b] : b.text.split(/\s+\|\s+/).map((text) => ({ ...b, text }))))
  let credit: string | null = null
  const title = head.text.trim().replace(/\s+/g, ' ')
  let yieldText: string | null = null
  let prepMinutes: number | null = null
  let cookMinutes: number | null = null
  let totalMinutes: number | null = null

  // Pull yield/time lines out first; they can sit anywhere near the top.
  const rest: Block[] = []
  for (const b of body) {
    const t = b.text.trim()
    const y = YIELD.exec(t)
    let used = false
    const by = CREDIT.exec(t)
    if (by) {
      credit ??= by[1].replace(/[.\s]+$/, '')
      continue
    }
    if (y && !yieldText && t.length < 80) {
      yieldText = t
      used = true
    }
    for (const m of t.matchAll(TIME)) {
      const minutes = parseMinutes(m[2])
      const kind = m[1].toLowerCase()
      if (minutes == null) continue
      if (kind.startsWith('prep') || kind === 'active') prepMinutes ??= minutes
      else if (kind.startsWith('cook') || kind === 'baking') cookMinutes ??= minutes
      else totalMinutes ??= minutes
      if (t.length < 80) used = true
    }
    if (!used) rest.push(b)
  }

  const ingLabel = rest.findIndex((b) => INGREDIENTS_LABEL.test(b.text.trim()))
  const methodLabel = rest.findIndex((b) => METHOD_LABEL.test(b.text.trim()))
  let ingredientBlocks: Block[] = []
  let stepBlocks: Block[] = []

  // Short lines between the title and the ingredients are the cook's notes.
  let notes: string[] = []
  let listed = false
  if (ingLabel >= 0) {
    notes = rest.slice(0, ingLabel).filter((b) => b.kind === 'text').map((b) => b.text.trim())
    const end = methodLabel > ingLabel ? methodLabel : rest.findIndex((b, i) => i > ingLabel && b.kind === 'text' && b.text.length > 120 && ingredientLikeness(b.text) < 0.3)
    ingredientBlocks = rest.slice(ingLabel + 1, end > ingLabel ? end : undefined)
    stepBlocks = methodLabel > ingLabel ? rest.slice(methodLabel + 1) : end > ingLabel ? rest.slice(end) : []
  } else {
    // No labels: the longest run of ingredient-like lines (group labels allowed inside) is the list.
    let best = { start: -1, len: 0 }
    let start = -1
    let len = 0
    rest.forEach((b, i) => {
      // Once a list has started, weaker lines ("Pinch of salt") and group labels continue it.
      const score = ingredientLikeness(b.text)
      const like = score >= 0.5 || (len > 0 && (score >= 0.35 || (GROUP_LABEL.test(b.text.trim()) && b.text.length < 45)))
      if (like) {
        if (start < 0) start = i
        len++
        if (len > best.len) best = { start, len }
      } else {
        start = -1
        len = 0
      }
    })
    // In a book with styled titles the layout is reliable: the short lines before the first
    // method sentence are the ingredients, even without amounts ("Turkey", "Olive oil").
    let lead0 = 0
    while (lead0 < rest.length && rest[lead0].kind === 'text' && isNote(rest[lead0].text)) lead0++
    const firstProse = headingsOnly ? rest.findIndex((b, i) => i > lead0 && b.kind === 'text' && isProse(b.text)) : -1
    if (firstProse > 0) {
      const lead = rest.slice(0, firstProse).filter((b) => b.kind === 'text')
      let n = 0
      while (n < lead.length && isNote(lead[n].text)) n++
      if (lead.length - n >= Math.max(1, best.len)) {
        notes = lead.slice(0, n).map((b) => b.text.trim())
        ingredientBlocks = lead.slice(n)
        stepBlocks = rest.slice(firstProse)
        listed = true
        best = { start: -1, len: 0 }
      }
    }
    if (best.len > 0) {
      ingredientBlocks = rest.slice(best.start, best.start + best.len)
      stepBlocks = rest.slice(best.start + best.len)
      notes = rest.slice(0, best.start).filter((b) => b.kind === 'text' && b.text.length <= 300).map((b) => b.text.trim())
    }
    if (methodLabel >= 0) stepBlocks = rest.slice(methodLabel + 1)
  }

  const ingredientLines = ingredientBlocks.map((b) => b.text.trim()).filter(Boolean)
  const items = ingredientLines.filter((l) => !(GROUP_LABEL.test(l) && ingredientLikeness(l) < 0.5)).map(parseIngredient)
  const steps = stepsForCooking(
    splitSteps(
      stepBlocks
        .map((b) => b.text.trim())
        .filter((t) => t.length > 12 && !METHOD_LABEL.test(t) && !INGREDIENTS_LABEL.test(t)),
    ),
  )

  // Not a recipe (an essay, a chapter intro, a contents page).
  if (items.length < 2 && !(items.length >= 1 && steps.length >= 1 && (ingLabel >= 0 || listed))) return null

  const servings = yieldText ? Number((/\d+/.exec(yieldText) ?? [])[0]) || null : null
  return {
    title,
    ingredientLines,
    items,
    steps,
    yieldText,
    servings,
    prepMinutes,
    cookMinutes,
    totalMinutes,
    confidence: confidence({ title, items, steps, yieldText, times: [prepMinutes, cookMinutes, totalMinutes], labelled: ingLabel >= 0 }),
    loc: head.loc ?? null,
    notes: notes.filter(Boolean).slice(0, 5),
    credit,
    chapter,
  }
}

/** 0–1. Below 0.6 a recipe goes to "Needs review". */
export function confidence(r: { title: string; items: Ingredient[]; steps: string[]; yieldText: string | null; times: (number | null)[]; labelled: boolean }): number {
  let c = 0
  if (r.title.length >= 3 && r.title.length <= 80 && !/^\d/.test(r.title)) c += 0.15
  if (r.items.length >= 2) c += 0.2
  const measured = r.items.filter((i) => i.qty != null || i.unit != null).length / Math.max(1, r.items.length)
  c += 0.15 * measured
  const known = r.items.filter((i) => i.known).length / Math.max(1, r.items.length)
  c += 0.15 * known
  if (r.steps.length >= 1) c += 0.15
  if (r.steps.length >= 2) c += 0.05
  if (r.yieldText || r.times.some((t) => t != null)) c += 0.05
  if (r.labelled) c += 0.1
  return Math.round(Math.min(1, c) * 100) / 100
}

/**
 * Extracts every complete recipe. When more text is coming (`final` false), the last
 * section may continue on the next page, so it's returned as `carry` to prepend next time.
 */
export function extractRecipes(blocks: Block[], final: boolean, chapter: string | null = null): { recipes: ExtractedRecipe[]; carry: Block[]; chapter: string | null } {
  const parts = sections(blocks)
  const headingsOnly = usesHeadings(blocks)
  const carry = !final && parts.length ? parts.pop()! : []
  const recipes: ExtractedRecipe[] = []
  for (const part of parts) {
    const r = recipeFrom(part, chapter, headingsOnly)
    if (r) recipes.push(r)
    // A big heading with nothing under it is a chapter page ("Desserts").
    else if (part[0].kind === 'heading' && (part[0].level ?? 3) <= 2 && part.length <= 2 && part[0].text.length <= 40) chapter = part[0].text.trim()
  }
  return { recipes, carry, chapter }
}

export const REVIEW_THRESHOLD = 0.6
