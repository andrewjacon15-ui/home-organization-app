import { collection, doc, getDoc, getDocs, Timestamp, type DocumentData } from 'firebase/firestore'
import { db } from '../../firebase'
import { toDateKey } from '../../lib/dates'

/**
 * "Download a copy": everything the household keeps, as one JSON file you own. Members only
 * (it reads what the rules already let them read). Left out: sign-in tokens (never readable),
 * cooking progress and the recipe search index (temporary or rebuilt), and photo files
 * themselves (each photo's link is included).
 */
export const EXPORTED = ['members', 'events', 'calendars', 'chores', 'stars', 'rewards', 'mealPlans', 'mealTemplates', 'recipes', 'cookbooks', 'countdowns', 'photos', 'settings', 'reminderPrefs'] as const

/** Firestore values → plain JSON (timestamps as ISO dates). */
export function plain(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  if (Array.isArray(v)) return v.map(plain)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x)]))
  return v
}

const rows = (docs: { id: string; data: () => DocumentData }[]) => docs.map((d) => ({ id: d.id, ...(plain(d.data()) as object) }))

export interface HouseholdExport {
  format: 'family-organizer-export'
  version: 1
  exportedAt: string
  household: Record<string, unknown>
  lists: Record<string, unknown>[]
  [collection: string]: unknown
}

export async function exportHousehold(familyId: string): Promise<HouseholdExport> {
  const base = ['families', familyId] as const
  const family = await getDoc(doc(db, ...base))
  const out: HouseholdExport = {
    format: 'family-organizer-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    household: { id: familyId, ...(plain(family.data() ?? {}) as object) },
    lists: [],
  }
  // Anything this member isn't allowed to list (someone else's reminder settings) is skipped, not fatal.
  const results = await Promise.allSettled(EXPORTED.map((name) => getDocs(collection(db, ...base, name)).then((s) => [name, rows(s.docs)] as const)))
  const skipped: string[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') out[r.value[0]] = r.value[1]
    else skipped.push(EXPORTED[i])
  })
  if (skipped.length) out.skipped = skipped
  // Each list with its items.
  const lists = await getDocs(collection(db, ...base, 'lists'))
  out.lists = await Promise.all(lists.docs.map(async (l) => ({ id: l.id, ...(plain(l.data()) as object), items: rows((await getDocs(collection(db, ...base, 'lists', l.id, 'items'))).docs) })))
  return out
}

/** "the-rivera-family-2026-10-03.json" */
export function exportFileName(name: string, today = toDateKey(new Date())): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'household'
  return `${slug}-${today}.json`
}

/** Saves the export as a file (the browser's download; the share sheet isn't needed). */
export function downloadJson(data: unknown, fileName: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
