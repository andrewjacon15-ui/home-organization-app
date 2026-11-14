import { CalendarIcon, CartIcon, ChoresIcon, HomeIcon, ListsIcon, MealsIcon, PhotosIcon, RecipesIcon, RewardsIcon, SettingsIcon, WeatherIcon } from './Icons'
import type { NavTab } from './NavRail'

export type Tab = 'home' | 'calendar' | 'groceries' | 'lists' | 'chores' | 'rewards' | 'meals' | 'recipes' | 'photos' | 'weather' | 'settings'

export const TABS: NavTab<Tab>[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'calendar', label: 'Calendar', Icon: CalendarIcon },
  { id: 'groceries', label: 'Groceries', Icon: CartIcon },
  { id: 'lists', label: 'Lists', Icon: ListsIcon },
  { id: 'chores', label: 'Chores', Icon: ChoresIcon },
  { id: 'rewards', label: 'Rewards', Icon: RewardsIcon },
  { id: 'meals', label: 'Meals', Icon: MealsIcon },
  { id: 'recipes', label: 'Recipes', Icon: RecipesIcon },
  { id: 'photos', label: 'Photos', Icon: PhotosIcon },
  { id: 'weather', label: 'Weather', Icon: WeatherIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
]

/** Settings can't be hidden, or there'd be no way back to turn things on again. */
export const ALWAYS_SHOWN: Tab = 'settings'

/** How many sections fit in the phone's bottom bar before More takes over (the fifth button). */
export const PHONE_BAR = 4

/**
 * The side bar for one device: everything not hidden, in order. On a phone, the sections
 * pinned there (in the order they were pinned) go in the bottom bar; with nothing pinned
 * it's the first four besides Settings. The rest live under More.
 */
export function navFor(hidden: readonly string[] | undefined, pinned?: readonly string[] | null): NavTab<Tab>[] {
  const shown = TABS.filter((t) => t.id === ALWAYS_SHOWN || !hidden?.includes(t.id))
  const picked = (pinned ?? []).filter((id, i, all) => all.indexOf(id) === i && shown.some((t) => t.id === id)).slice(0, PHONE_BAR)
  if (!picked.length) {
    const bar = new Set(shown.filter((t) => t.id !== ALWAYS_SHOWN).slice(0, PHONE_BAR).map((t) => t.id))
    return shown.map((t) => ({ ...t, phone: bar.has(t.id) }))
  }
  const rank = (id: string) => picked.indexOf(id)
  return [...shown.filter((t) => rank(t.id) >= 0).sort((a, b) => rank(a.id) - rank(b.id)).map((t) => ({ ...t, phone: true })), ...shown.filter((t) => rank(t.id) < 0).map((t) => ({ ...t, phone: false }))]
}

const PINS_KEY = 'phone-bar'

/** The sections this phone pinned to its bottom bar (saved on the phone itself), or null for the usual four. */
export function readPins(): string[] | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PINS_KEY) ?? 'null')
    return Array.isArray(saved) && saved.every((x) => typeof x === 'string') && saved.length ? saved : null
  } catch {
    return null
  }
}

export function savePins(pins: string[] | null) {
  try {
    if (pins?.length) localStorage.setItem(PINS_KEY, JSON.stringify(pins))
    else localStorage.removeItem(PINS_KEY)
  } catch {
    // The usual four show next time.
  }
}
