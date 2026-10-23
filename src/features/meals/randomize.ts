import type { CatalogEntry } from '../recipes/catalog'
import type { PlannedSlot } from './upcomingMeals'

/** Not a meal on their own: never picked for breakfast, lunch or dinner. */
const NOT_A_MEAL = new Set(['side', 'dessert', 'snack', 'drink'])

/** One meal to fill: a day (YYYY-MM-DD, or a weekday "0"–"6" in a template) and which meal. */
export interface Wanted {
  day: string
  slot: PlannedSlot
}

export interface PickOptions {
  /** Titles already on the plan this week: never picked twice. */
  taken?: string[]
  /** Titles planned in the last two weeks: skipped while there's anything else. */
  recent?: string[]
  /** Ingredients the household never wants (Settings → Kitchen): recipes with them are never picked. */
  avoid?: string[]
  random?: () => number
}

const norm = (t: string) => t.trim().toLowerCase()

/**
 * The recipes that suit a meal: ones tagged for it, never sides, desserts or drinks, never
 * ones still waiting for review or containing something on the avoid list. Dinner also takes
 * recipes with no meal tag (most saved recipes are dinners); breakfast and lunch do only when
 * nothing is tagged for them.
 */
export function candidatesFor(entries: CatalogEntry[], slot: PlannedSlot, avoid: string[] = []): CatalogEntry[] {
  const no = new Set(avoid.map(norm))
  const ok = entries.filter((e) => !e.r && !e.k.some((k, i) => no.has(k) || no.has(e.fa[i] ?? '')))
  const meals = (e: CatalogEntry) => e.g?.meal ?? []
  const untagged = ok.filter((e) => meals(e).length === 0)
  const tagged = ok.filter((e) => meals(e).includes(slot))
  if (slot === 'dinner') return [...tagged, ...untagged]
  return tagged.length ? tagged : untagged.filter((e) => !meals(e).some((m) => NOT_A_MEAL.has(m)))
}

/** A weighted random choice; weights ≤ 0 never win. */
function choose<T>(items: { item: T; weight: number }[], random: () => number): T | null {
  const total = items.reduce((n, x) => n + Math.max(0, x.weight), 0)
  if (total <= 0) return null
  let r = random() * total
  for (const x of items) {
    r -= Math.max(0, x.weight)
    if (r < 0) return x.item
  }
  return items[items.length - 1].item
}

/**
 * Picks a recipe for each wanted meal, in order. Never the same recipe twice in a week;
 * nothing from the last two weeks while there's another choice; favorites twice as likely;
 * and variety in what it's built on (a third chicken dinner is unlikely, two in a row less so).
 * Resolves with title by "day:slot"; a meal with nothing to choose from is left out.
 */
export function pickMeals(entries: CatalogEntry[], wanted: Wanted[], opts: PickOptions = {}): Record<string, string> {
  const random = opts.random ?? Math.random
  const taken = new Set((opts.taken ?? []).map(norm))
  const recent = new Set((opts.recent ?? []).map(norm))
  const mains = new Map<string, number>()
  for (const e of entries) if (taken.has(norm(e.t))) for (const m of e.g?.main ?? []) mains.set(m, (mains.get(m) ?? 0) + 1)
  const out: Record<string, string> = {}
  let previous: string[] = []
  for (const w of wanted) {
    const pool = candidatesFor(entries, w.slot, opts.avoid).filter((e) => !taken.has(norm(e.t)))
    const fresh = pool.filter((e) => !recent.has(norm(e.t)))
    const from = fresh.length ? fresh : pool
    const pick = choose(
      from.map((e) => {
        const main = e.g?.main ?? []
        let weight = e.f ? 2 : 1
        if (main.some((m) => (mains.get(m) ?? 0) >= 2)) weight *= 0.3
        if (main.some((m) => previous.includes(m))) weight *= 0.5
        return { item: e, weight }
      }),
      random,
    )
    if (!pick) continue
    out[`${w.day}:${w.slot}`] = pick.t
    taken.add(norm(pick.t))
    previous = pick.g?.main ?? []
    for (const m of previous) mains.set(m, (mains.get(m) ?? 0) + 1)
  }
  return out
}
