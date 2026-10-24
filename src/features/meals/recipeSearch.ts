import type { CatalogEntry } from '../recipes/catalog'
import { candidatesFor } from './randomize'
import type { PlannedSlot } from './upcomingMeals'

/** How many suggestions show at once. */
const SHOWN = 8

/**
 * Recipes for a search: every word of it found in the title, an ingredient, or a tag ("chicken
 * rice", "mexican", "quick"); title matches first, then favorites. With nothing typed, the
 * recipes that suit the meal, favorites first.
 */
export function searchRecipes(entries: CatalogEntry[], text: string, slot?: PlannedSlot): CatalogEntry[] {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (!words.length) {
    const suited = slot ? candidatesFor(entries, slot) : entries
    return [...suited].sort((a, b) => Number(!!b.f) - Number(!!a.f) || a.t.localeCompare(b.t)).slice(0, SHOWN)
  }
  const scored = entries.flatMap((e) => {
    const title = e.t.toLowerCase()
    const tags = Object.values(e.g ?? {}).flat().join(' ').toLowerCase()
    const keys = [...e.k, ...e.fa].join(' ').toLowerCase()
    const quick = e.m != null && e.m <= 30 ? 'quick' : ''
    let score = 0
    for (const w of words) {
      if (title.includes(w)) score += 3
      else if (tags.includes(w) || quick.startsWith(w)) score += 2
      else if (keys.includes(w)) score += 1
      else return []
    }
    return [{ e, score: score + (e.f ? 0.5 : 0) }]
  })
  return scored.sort((a, b) => b.score - a.score || a.e.t.localeCompare(b.e.t)).slice(0, SHOWN).map((x) => x.e)
}
