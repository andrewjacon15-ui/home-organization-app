/**
 * The recipe catalog in the app: the compact index (families/{f}/recipeIndex, a few shard
 * documents kept by Cloud Functions) for browsing and filtering, and pure filter helpers.
 * The full recipe is read only when one is opened, so a big cookbook library costs a
 * handful of reads to browse instead of one per recipe.
 */
import { collection, doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { INDEX_VERSION, toIndexEntry, type IndexEntry } from '@shared/recipes/catalogIndex.js'
import { foldAccents } from '@shared/recipes/dictionary.js'
import { RATED_MIN_MATCH, type MatchResult, type SearchPriority } from '@shared/recipes/matcher.js'
import { TAG_OPTIONS, type RecipeTags } from '@shared/recipes/tagger.js'
import { db, functions } from '../../firebase'
import type { Recipe } from './recipesApi'

export interface CatalogEntry extends IndexEntry {
  id: string
}

/** Entries, plus whether the index is current (false → ask the server to build it). */
export function watchCatalog(familyId: string, onChange: (entries: CatalogEntry[], current: boolean) => void) {
  return onSnapshot(collection(db, 'families', familyId, 'recipeIndex'), (snap) => {
    let version = 0
    const out: CatalogEntry[] = []
    for (const d of snap.docs) {
      const x = d.data()
      if (d.id === 'meta') {
        version = typeof x.v === 'number' ? x.v : 0
        continue
      }
      for (const [id, e] of Object.entries((x.e ?? {}) as Record<string, IndexEntry>)) out.push({ ...e, id })
    }
    out.sort((a, b) => a.t.localeCompare(b.t))
    onChange(out, version >= INDEX_VERSION)
  })
}

export async function rebuildCatalog(familyId: string) {
  await httpsCallable(functions, 'recipeIndexRebuild')({ familyId })
}

export interface ImportResult {
  id: string
  title: string
  existed: boolean
  needsReview: boolean
}

/** Reads a recipe page on the server and saves it to the catalog. */
export async function importRecipe(familyId: string, url: string): Promise<ImportResult> {
  const res = await httpsCallable<{ familyId: string; url: string }, ImportResult>(functions, 'importRecipeUrl', { timeout: 70_000 })({ familyId, url })
  return res.data
}

export function setFavorite(familyId: string, id: string, favorite: boolean) {
  return updateDoc(doc(db, 'families', familyId, 'recipes', id), { favorite, updatedAt: serverTimestamp() })
}

export function saveTags(familyId: string, id: string, tags: RecipeTags) {
  return updateDoc(doc(db, 'families', familyId, 'recipes', id), { tags, tagsEdited: true, updatedAt: serverTimestamp() })
}

/** A recipe's index entry, built in the app (tests, and before the server catches up). */
export function entryFor(r: Recipe & { items?: unknown; tags?: unknown }): CatalogEntry {
  return { ...toIndexEntry(r as unknown as Record<string, unknown>), id: r.id }
}

export const findEntry = (entries: CatalogEntry[], mealText: string) => {
  const key = mealText.trim().toLowerCase()
  return key ? entries.find((e) => e.t.trim().toLowerCase() === key) : undefined
}

// ---- filters ----------------------------------------------------------------

export type TimeFilter = '' | 'quick' | 'medium' | 'long'
export type SourceFilter = '' | 'cookbook' | 'online' | 'manual'

export interface CatalogFilters {
  q: string
  meal: string
  cuisine: string
  main: string
  diet: string
  time: TimeFilter
  source: SourceFilter
  favorites: boolean
  review: boolean
}

export const NO_FILTERS: CatalogFilters = { q: '', meal: '', cuisine: '', main: '', diet: '', time: '', source: '', favorites: false, review: false }

export const TIME_LABELS: Record<Exclude<TimeFilter, ''>, string> = { quick: 'Under 30 min', medium: '30–60 min', long: 'Over an hour' }
export const SOURCE_LABELS: Record<Exclude<SourceFilter, ''>, string> = { cookbook: 'Cookbooks', online: 'From the web', manual: 'Added by us' }

const fold = (s: string) => foldAccents(s.toLowerCase())

function timeOf(m: number | null): TimeFilter {
  if (m == null) return ''
  return m < 30 ? 'quick' : m <= 60 ? 'medium' : 'long'
}

type Facet = 'meal' | 'cuisine' | 'main' | 'diet' | 'time' | 'source'

function passes(e: CatalogEntry, f: CatalogFilters, skip?: Facet): boolean {
  if (f.favorites && !e.f) return false
  if (f.review && !e.r) return false
  for (const k of ['meal', 'cuisine', 'main', 'diet'] as const) if (skip !== k && f[k] && !e.g[k].includes(f[k])) return false
  if (skip !== 'time' && f.time && timeOf(e.m) !== f.time) return false
  if (skip !== 'source' && f.source && e.s !== f.source) return false
  const q = fold(f.q.trim())
  if (q) {
    const hay = fold(`${e.t} ${e.b ?? ''} ${e.k.join(' ')}`)
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false
  }
  return true
}

export function filterCatalog(entries: CatalogEntry[], f: CatalogFilters): CatalogEntry[] {
  return entries.filter((e) => passes(e, f))
}

export type CatalogSort = 'az' | 'quick' | 'favorites'
export const SORT_LABELS: Record<CatalogSort, string> = { az: 'A to Z', quick: 'Quickest first', favorites: 'Favorites first' }

/** A to Z, quickest first (untimed last), or favorites first. */
export function sortCatalog(entries: CatalogEntry[], sort: CatalogSort): CatalogEntry[] {
  const byTitle = (a: CatalogEntry, b: CatalogEntry) => a.t.localeCompare(b.t)
  return [...entries].sort((a, b) =>
    sort === 'az' ? byTitle(a, b) : sort === 'quick' ? (a.m ?? Infinity) - (b.m ?? Infinity) || byTitle(a, b) : Number(!!b.f) - Number(!!a.f) || byTitle(a, b),
  )
}

/** Options for one filter with how many recipes each would show (given the other filters). */
export function facetOptions(entries: CatalogEntry[], f: CatalogFilters, facet: Facet): { value: string; count: number }[] {
  const pool = entries.filter((e) => passes(e, f, facet))
  const values: string[] =
    facet === 'time' ? Object.keys(TIME_LABELS) : facet === 'source' ? Object.keys(SOURCE_LABELS) : TAG_OPTIONS[facet as keyof RecipeTags]
  return values
    .map((value) => ({
      value,
      count: pool.filter((e) => (facet === 'time' ? timeOf(e.m) === value : facet === 'source' ? e.s === value : e.g[facet as keyof RecipeTags].includes(value))).length,
    }))
    .filter((o) => o.count > 0 || o.value === f[facet])
}

export const activeFilterCount = (f: CatalogFilters) => (['meal', 'cuisine', 'main', 'diet', 'time', 'source'] as const).filter((k) => f[k]).length + (f.favorites ? 1 : 0)

export const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** Plain-words reasons a catalog recipe is suggested for what's in the kitchen. */
export function catalogReasons(entry: CatalogEntry, m: MatchResult): string[] {
  const needed = m.have.length + m.missing.length
  return [
    m.missing.length === 0 ? 'You have every ingredient' : `You have ${m.have.length} of its ${plural(needed, 'ingredient')}`,
    entry.f ? 'One of your favorites' : null,
    entry.m ? `Ready in ${entry.m} min` : null,
  ].filter((x): x is string => !!x)
}

/**
 * Our recipes by a priority. They have no cooks' ratings, so favorites stand in: "Best match" is
 * the fit alone, "Balanced" adds a little for favorites, "Best rated" puts favorites first
 * (among those that use enough of what you have).
 */
export function rankOurs(list: { entry: CatalogEntry; result: MatchResult }[], priority: SearchPriority) {
  const fav = (x: { entry: CatalogEntry }) => (x.entry.f ? 1 : 0)
  const score = (x: { entry: CatalogEntry; result: MatchResult }) =>
    priority === 'match' ? x.result.fit : priority === 'balanced' ? 0.8 * x.result.fit + 0.2 * fav(x) : 0.35 * x.result.fit + 0.65 * fav(x)
  const pool = priority === 'rating' ? list.filter((x) => x.result.match >= RATED_MIN_MATCH) : list
  return [...pool].sort((a, b) => score(b) - score(a) || b.result.match - a.result.match || a.entry.t.localeCompare(b.entry.t))
}
