import { useLayoutEffect, useState, type CSSProperties } from 'react'

/**
 * Sizes an element to fill the viewport below its top edge, so a wall display
 * never scrolls the page; its children scroll internally instead.
 * Off below 1000px wide (phones stack days and scroll the page normally).
 *
 * Returns a callback ref to put on the element and the style to apply.
 */
export function useFitHeight<T extends HTMLElement>(enabled: boolean, bottomGap = 8) {
  const [el, setEl] = useState<T | null>(null)
  const [height, setHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!enabled || !el) return
    const measure = () => {
      if (window.innerWidth < 1000) return setHeight(null)
      const box = el.getBoundingClientRect()
      const top = box.top + window.scrollY
      // What has to fit below it: following siblings (e.g. a legend) and the page's bottom padding.
      // (Not scrollHeight: the shell is min-height 100vh, so empty space would count too.)
      let below = 0
      for (let n = el.nextElementSibling; n; n = n.nextElementSibling) below += n.getBoundingClientRect().height + 16
      const page = el.closest('.app')
      if (page) below += parseFloat(getComputedStyle(page).paddingBottom) || 0
      setHeight(Math.max(320, Math.floor(window.innerHeight - top - below - bottomGap)))
    }
    measure()
    window.addEventListener('resize', measure)
    // Content above can appear or vanish (a banner, a card) without resizing the window,
    // so re-check once a second; setHeight with an unchanged value doesn't re-render.
    const id = setInterval(measure, 1000)
    return () => {
      window.removeEventListener('resize', measure)
      clearInterval(id)
    }
  }, [enabled, el, bottomGap])

  const style: CSSProperties | undefined = enabled && height ? { height } : undefined
  return [setEl, style] as const
}
