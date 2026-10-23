/** "As each recipe is written", then 1–12 people: how many a plan's groceries are for. */
export const PEOPLE_OPTIONS = [{ value: '', label: 'As each recipe is written' }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} ${i === 0 ? 'person' : 'people'}` }))]
export const peopleValue = (p: number | null) => (p ? String(p) : '')
export const readPeopleValue = (v: string) => (v ? Number(v) : null)
