import { useEffect, useRef, useState } from 'react'

/** The box pops and the line strikes through (CSS, .list-item--ticking), then the row folds away. */
export const STRIKE_MS = 320
const FOLD_MS = 180

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Checking an item off plays a short animation before it leaves the list: the box pops with its
 * tick, a line strikes through the words, and the row folds shut so nothing below jumps. Then
 * `done` saves it. With reduced motion (or no Web Animations), it saves straight away.
 */
export function useTickOff() {
  const [ticking, setTicking] = useState<ReadonlySet<string>>(new Set())
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t)
      fn()
    }, ms)
    timers.current.add(t)
  }
  const untick = (id: string) =>
    setTicking((s) => {
      const next = new Set(s)
      next.delete(id)
      return next
    })

  function tick(id: string, row: HTMLElement | null, done: () => void) {
    if (ticking.has(id)) return
    if (!row || typeof row.animate !== 'function' || reducedMotion()) return done()
    navigator.vibrate?.(10)
    setTicking((s) => new Set(s).add(id))
    later(() => {
      const fold = row.animate([{ height: `${row.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: FOLD_MS, easing: 'ease-in', fill: 'forwards' })
      fold.onfinish = () => {
        done()
        // Saved, the item moves to Done and this row goes away. If it's still here (the save
        // failed), open it back up.
        later(() => {
          if (!row.isConnected) return
          fold.cancel()
          untick(id)
        }, 1500)
      }
    }, STRIKE_MS)
  }

  return { ticking, tick }
}
