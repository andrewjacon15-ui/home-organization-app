import type { HouseholdSummary } from './householdInvites'

const bytesOf = (h: HouseholdSummary) => h.photoBytes + h.cookbookBytes + h.otherBytes

export type Sort = 'oldest' | 'newest' | 'largest' | 'people' | 'name'
export const SORTS: { value: Sort; label: string }[] = [
  { value: 'oldest', label: 'Oldest first' },
  { value: 'newest', label: 'Newest first' },
  { value: 'largest', label: 'Most storage' },
  { value: 'people', label: 'Most people' },
  { value: 'name', label: 'Name' },
]

/** Households filtered by name, owner or person, in the chosen order. */
export function sortHouseholds(list: HouseholdSummary[], sort: Sort, query: string): HouseholdSummary[] {
  const q = query.trim().toLowerCase()
  const hit = (h: HouseholdSummary) =>
    !q || [h.name, h.ownerEmail ?? '', ...h.people.flatMap((p) => [p.name, p.email ?? ''])].some((t) => t.toLowerCase().includes(q))
  const by: Record<Sort, (a: HouseholdSummary, b: HouseholdSummary) => number> = {
    oldest: (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
    newest: (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
    largest: (a, b) => bytesOf(b) - bytesOf(a),
    people: (a, b) => b.members - a.members,
    name: (a, b) => a.name.localeCompare(b.name),
  }
  return list.filter(hit).sort(by[sort])
}
