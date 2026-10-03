import { CalendarIcon, ChoresIcon, HomeIcon, ListsIcon, MealsIcon, PhotosIcon, RecipesIcon, RewardsIcon, SettingsIcon, WeatherIcon } from './Icons'
import type { NavTab } from './NavRail'

export type Tab = 'home' | 'calendar' | 'lists' | 'chores' | 'rewards' | 'meals' | 'recipes' | 'photos' | 'weather' | 'settings'

export const TABS: NavTab<Tab>[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'calendar', label: 'Calendar', Icon: CalendarIcon },
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

/** How many sections fit in the phone's bottom bar before More takes over. */
const PHONE_BAR = 4

/**
 * The side bar for one device: everything not hidden, in order. The first four
 * (besides Settings) go in the phone's bottom bar; the rest live under More.
 */
export function navFor(hidden: readonly string[] | undefined): NavTab<Tab>[] {
  const shown = TABS.filter((t) => t.id === ALWAYS_SHOWN || !hidden?.includes(t.id))
  const bar = new Set(shown.filter((t) => t.id !== ALWAYS_SHOWN).slice(0, PHONE_BAR).map((t) => t.id))
  return shown.map((t) => ({ ...t, phone: bar.has(t.id) }))
}
