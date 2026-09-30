import { useEffect, useState } from 'react'

/**
 * Marks children (matching `selector`) of a list whose content doesn't fit and that
 * aren't scrolled to the end, with `className`, so the CSS can fade the bottom edge and
 * say there's more. Re-checks on scroll, resize, and once a second (events arrive live).
 */
export function useOverflowCue<T extends HTMLElement>(selector: string, className: string) {
  const [el, setEl] = useState<T | null>(null)

  useEffect(() => {
    if (!el) return
    const check = () => {
      for (const cell of el.querySelectorAll<HTMLElement>(selector)) {
        const more = cell.scrollHeight - cell.clientHeight > 2 && cell.scrollTop + cell.clientHeight < cell.scrollHeight - 2
        cell.classList.toggle(className, more)
      }
    }
    check()
    el.addEventListener('scroll', check, true)
    window.addEventListener('resize', check)
    const id = setInterval(check, 1000)
    return () => {
      el.removeEventListener('scroll', check, true)
      window.removeEventListener('resize', check)
      clearInterval(id)
    }
  }, [el, selector, className])

  return setEl
}
