import { useLayoutEffect, useState, type CSSProperties } from 'react'

/**
 * Sizes an element to fill the main panel below its top edge, so a wall display
 * never scrolls; its children scroll internally instead.
 * Off below 1000px wide (phones stack days and scroll the panel normally).
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
      // The main panel (.app) is the scroller; measure within it so its scroll position doesn't matter.
      const panel = el.closest<HTMLElement>('.app')
      const panelTop = panel ? panel.getBoundingClientRect().top - panel.scrollTop : 0
      const panelHeight = panel ? panel.clientHeight : window.innerHeight
      const top = el.getBoundingClientRect().top - panelTop
      // What has to fit below it: following siblings (e.g. a legend) and the panel's bottom padding.
      let below = 0
      for (let n = el.nextElementSibling; n; n = n.nextElementSibling) below += n.getBoundingClientRect().height + 16
      if (panel) below += parseFloat(getComputedStyle(panel).paddingBottom) || 0
      setHeight(Math.max(320, Math.floor(panelHeight - top - below - bottomGap)))
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
