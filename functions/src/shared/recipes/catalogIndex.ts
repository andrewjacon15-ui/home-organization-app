/**
 * The catalog index: one small entry per recipe, packed into a few shard documents
 * (families/{f}/recipeIndex/{shard}), so browsing, filtering, and "What can I make?" read
 * a handful of documents instead of every recipe. Kept in sync by a Firestore trigger.
 */
import { cleanTags, type RecipeTags } from './tagger.js'

/** Bump when the entry shape changes: the app asks the server to rebuild once. */
export const INDEX_VERSION = 1
export const INDEX_SHARDS = 8

export interface IndexEntry {
  /** Title */
  t: string
  /** Ingredient keys (dictionary keys), for search and matching. */
  k: string[]
  /** Ingredient families ("chicken thigh" → "chicken"), parallel to k. */
  fa: string[]
  g: RecipeTags
  /** Minutes (total), or null. */
  m: number | null
  /** Source: cookbook | online | manual, and the book title or site name. */
  s: 'cookbook' | 'online' | 'manual'
  b: string | null
  /** Favorite, needs review. */
  f: boolean
  r: boolean
  /** Rating (web recipes): value 0–5 and count. */
  rv: number | null
  rc: number | null
  /** Servings, for the scaler and display. */
  n: number | null
}

/** FNV-1a → shard number. Same function on server and client. */
export function shardOf(id: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193)
  return `s${(h >>> 0) % INDEX_SHARDS}`
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A recipe document → its index entry. */
export function toIndexEntry(d: Record<string, unknown>): IndexEntry {
  const items = Array.isArray(d.items) ? (d.items as { key?: unknown; family?: unknown }[]) : []
  const k: string[] = []
  const fa: string[] = []
  for (const i of items) {
    const key = typeof i?.key === 'string' ? i.key : ''
    if (!key || k.includes(key)) continue
    k.push(key.slice(0, 40))
    fa.push((typeof i.family === 'string' && i.family ? i.family : key).slice(0, 40))
    if (k.length >= 40) break
  }
  const source = (d.source ?? {}) as { type?: unknown; bookTitle?: unknown; siteName?: unknown }
  const s = source.type === 'cookbook' || source.type === 'online' ? source.type : 'manual'
  const rating = (d.rating ?? {}) as { value?: unknown; count?: unknown }
  return {
    t: String(d.title ?? '').slice(0, 120),
    k,
    fa,
    g: cleanTags(d.tags),
    m: num(d.totalMinutes) ?? num(d.minutes),
    s,
    b: s === 'cookbook' ? String(source.bookTitle ?? '').slice(0, 80) || null : s === 'online' ? String(source.siteName ?? '').slice(0, 80) || null : null,
    f: d.favorite === true,
    r: d.needsReview === true,
    rv: num(rating.value),
    rc: num(rating.count),
    n: num(d.servings),
  }
}

export function sameEntry(a: IndexEntry | null, b: IndexEntry | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
