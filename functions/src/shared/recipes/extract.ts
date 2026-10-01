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
}

const INGREDIENTS_LABEL = /^(ingredients?|you will need|you'll need|what you need)\s*:?$/i
const METHOD_LABEL = /^(method|directions?|instructions?|preparation|steps|procedure|to (make|prepare|serve))\s*:?$/i
const GROUP_LABEL = /^(for the .{2,40}|.{2,40}:)$/i
const YIELD = /^(?:serves|servings?|makes|yields?|portions?|feeds)\b\s*:?\s*(.{1,60})$/i
const TIME = /\b(prep(?:aration)?|cook(?:ing)?|baking|total|active|ready in|start to finish)\s*(?:time)?\s*:?\s*((?:\d+\s*(?:-\s*\d+\s*)?(?:hours?|hrs?|h|minutes?|mins?|m)\b\s*(?:and\s*)?)+)/gi
const STEP_NUMBER = /^\s*(?:step\s*)?(\d{1,2})[.):]\s+/i

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

function isTitleCandidate(b: Block, next: Block[]): boolean {
  const t = b.text.trim()
  if (t.length < 3 || t.length > 90) return false
  // Titles start with a letter, digit, or quote, never stray OCR punctuation like "[" or "|".
  if (/^[^\p{L}\p{N}"'“‘]/u.test(t)) return false
  if (INGREDIENTS_LABEL.test(t) || METHOD_LABEL.test(t) || YIELD.test(t) || /^for the\b/i.test(t) || t.endsWith(':')) return false
  TIME.lastIndex = 0
  if (TIME.test(t)) return false
  if (ingredientLikeness(t) >= 0.5) return false
  if (b.kind === 'heading') return true
  // An un-styled short line (common in PDFs) counts if a recipe clearly follows it.
  if (b.kind === 'text' && t.length <= 70 && !/[.!?]$/.test(t)) {
    const soon = next.slice(0, 5)
    const labelled = soon.some((x) => INGREDIENTS_LABEL.test(x.text.trim()))
    const run = soon.filter((x) => ingredientLikeness(x.text) >= 0.5).length
    return labelled || run >= 2
  }
  return false
}

/** Splits blocks into sections that each start at a title candidate. */
function sections(blocks: Block[]): Block[][] {
  const out: Block[][] = []
  let current: Block[] = []
  blocks.forEach((b, i) => {
    if (isTitleCandidate(b, blocks.slice(i + 1)) && current.length) {
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

function recipeFrom(section: Block[]): ExtractedRecipe | null {
  const [head, ...body] = section
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

  if (ingLabel >= 0) {
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
    if (best.len > 0) {
      ingredientBlocks = rest.slice(best.start, best.start + best.len)
      stepBlocks = rest.slice(best.start + best.len)
    }
    if (methodLabel >= 0) stepBlocks = rest.slice(methodLabel + 1)
  }

  const ingredientLines = ingredientBlocks.map((b) => b.text.trim()).filter(Boolean)
  const items = ingredientLines.filter((l) => !(GROUP_LABEL.test(l) && ingredientLikeness(l) < 0.5)).map(parseIngredient)
  const steps = splitSteps(
    stepBlocks
      .map((b) => b.text.trim())
      .filter((t) => t.length > 12 && !METHOD_LABEL.test(t) && !INGREDIENTS_LABEL.test(t)),
  )

  // Not a recipe (an essay, a chapter intro, a contents page).
  if (items.length < 2 && !(items.length >= 1 && steps.length >= 1 && ingLabel >= 0)) return null

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
export function extractRecipes(blocks: Block[], final: boolean): { recipes: ExtractedRecipe[]; carry: Block[] } {
  const parts = sections(blocks)
  const carry = !final && parts.length ? parts.pop()! : []
  const recipes = parts.map(recipeFrom).filter((r): r is ExtractedRecipe => r != null)
  return { recipes, carry }
}

export const REVIEW_THRESHOLD = 0.6
