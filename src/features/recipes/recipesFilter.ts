/** A one-time request, from elsewhere in the app, to open Recipes on a filter. */
const KEY = 'recipes-open-filter'

export function requestRecipesFilter(filter: 'review') {
  try {
    sessionStorage.setItem(KEY, filter)
  } catch {
    // Without storage the Recipes tab just opens on All.
  }
}

export function takeRecipesFilter(): 'all' | 'review' {
  try {
    const v = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return v === 'review' ? 'review' : 'all'
  } catch {
    return 'all'
  }
}
