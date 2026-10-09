import { useLayoutEffect, type RefObject } from 'react'

/**
 * Settings search: shows only the sections whose words match (titles, labels, hints) and the
 * same entries in the index (`li[data-id]`), and reveals `.settings-empty` when nothing does.
 * Done on the page itself, so every setting is searchable as it's written.
 */
export function useSettingsSearch(pageRef: RefObject<HTMLElement | null>, indexRef: RefObject<HTMLElement | null>, query: string, view: unknown) {
  useLayoutEffect(() => {
    const page = pageRef.current
    if (!page) return
    const term = query.trim().toLowerCase()
    const shown = new Set<string>()
    for (const s of page.querySelectorAll<HTMLElement>(':scope > .settings-section')) {
      const hit = !term || (s.textContent ?? '').toLowerCase().includes(term)
      s.hidden = !hit
      if (hit && s.id) shown.add(s.id)
    }
    for (const li of indexRef.current?.querySelectorAll<HTMLElement>('li[data-id]') ?? []) li.hidden = !!term && !shown.has(li.dataset.id ?? '')
    const empty = page.querySelector<HTMLElement>('.settings-empty')
    if (empty) empty.hidden = !term || shown.size > 0
  }, [pageRef, indexRef, query, view])
}
