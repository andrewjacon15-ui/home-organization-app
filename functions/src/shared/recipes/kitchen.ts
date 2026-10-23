/**
 * Household kitchen settings (families/{f}/settings/kitchen): pantry staples that don't count
 * against a recipe, and the recipe sites online search may use. Defaults live here.
 */
import { DEFAULT_STAPLES, SEARCH_PRIORITIES, type SearchPriority } from './matcher.js'

export interface KitchenSettings {
  staples: string[]
  sites: string[]
  /** How online results are sorted by default (a switch above them changes it for one search). */
  searchPriority: SearchPriority
  /** How many the household usually cooks for (scales grocery amounts); null = as each recipe is written. */
  people: number | null
  /** Ingredients never wanted (allergies, dislikes): the meal randomizer skips recipes with them. */
  avoid: string[]
}

/** Well-known recipe sites that publish schema.org recipes. Editable in Settings. */
export const DEFAULT_SITES = [
  'seriouseats.com',
  'bonappetit.com',
  'cooking.nytimes.com',
  'smittenkitchen.com',
  'budgetbytes.com',
  'allrecipes.com',
  'bbcgoodfood.com',
  'foodnetwork.com',
  'kingarthurbaking.com',
  'simplyrecipes.com',
  'epicurious.com',
  'food52.com',
]

export const DEFAULT_KITCHEN: KitchenSettings = { staples: DEFAULT_STAPLES, sites: DEFAULT_SITES, searchPriority: 'balanced', people: null, avoid: [] }

/** "https://www.SeriousEats.com/foo" → "seriouseats.com"; null when it isn't a host name. */
export function normalizeSite(input: string): string | null {
  let s = input.trim().toLowerCase()
  if (!s) return null
  try {
    if (/^https?:\/\//.test(s)) s = new URL(s).hostname
  } catch {
    return null
  }
  s = s.replace(/^www\./, '').replace(/\/.*$/, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) && s.length <= 100 ? s : null
}

/** Is this URL on one of the sites (or a subdomain of one)? */
export function onSite(url: string, sites: string[]): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return false
  }
  return sites.some((s) => host === s || host.endsWith(`.${s}`))
}

export function readKitchen(raw: unknown): KitchenSettings {
  const d = (raw ?? {}) as Partial<Record<keyof KitchenSettings, unknown>>
  const strings = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : null)
  const priority = SEARCH_PRIORITIES.find((p) => p === d.searchPriority) ?? 'balanced'
  const people = typeof d.people === 'number' && Number.isInteger(d.people) && d.people >= 1 && d.people <= 30 ? d.people : null
  return { staples: strings(d.staples, 60) ?? DEFAULT_STAPLES, sites: strings(d.sites, 30) ?? DEFAULT_SITES, searchPriority: priority, people, avoid: strings(d.avoid, 60) ?? [] }
}
