import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ListItem } from './listsApi'

/** How long to hold before an item lifts (a quick tap still edits it). */
export const HOLD_MS = 450
/** Moving further than this before the hold ends means scrolling, not dragging. */
const SLOP_PX = 8
/** Near the top or bottom of the scrolling panel, it scrolls by itself while dragging. */
const EDGE_PX = 56

/** Where a dragged item would land: a group (a category, a person's section, or the list's top) and the item it goes before. */
export interface DropTarget {
  group: string
  beforeId: string | null
}

interface Pending {
  id: string
  pointerId: number
  x: number
  y: number
  row: HTMLElement
  timer: ReturnType<typeof setTimeout>
}

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

/** The drop target under a point: the section (`[data-drop-group]`) it's over, and the first row in it whose middle is below the point. */
export function targetAt(x: number, y: number, dragId: string): DropTarget | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  const group = el?.closest<HTMLElement>('[data-drop-group]')
  if (!group) return null
  const rows = [...group.querySelectorAll<HTMLElement>('[data-item-id]')].filter((r) => r.dataset.itemId !== dragId)
  const before = rows.find((r) => {
    const b = r.getBoundingClientRect()
    return y < b.top + b.height / 2
  })
  return { group: group.dataset.dropGroup!, beforeId: before?.dataset.itemId ?? null }
}

type Active = { id: string; row: HTMLElement; startX: number; startY: number; target: DropTarget | null; scroller: HTMLElement | null; startScroll: number; lastX: number; lastY: number }

/** Keeps the held item under the finger (as the panel scrolls too) and finds where it would land. */
function follow(a: Active, onTarget?: (t: DropTarget) => void) {
  const scrolled = (a.scroller?.scrollTop ?? 0) - a.startScroll
  a.row.style.transform = `translate(${a.lastX - a.startX}px, ${a.lastY - a.startY + scrolled}px)`
  const t = targetAt(a.lastX, a.lastY, a.id)
  if (t && (t.group !== a.target?.group || t.beforeId !== a.target?.beforeId)) {
    a.target = t
    onTarget?.(t)
  }
}

/**
 * Press and hold a list item to pick it up, then drag it to a new place, in its category or
 * another one. Works the same with a finger, a mouse or a pen: a short tap is still a tap
 * (it edits the item), and a swipe before the hold ends still scrolls.
 */
export function useItemDrag(onDrop: (id: string, target: DropTarget) => void) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [target, setTarget] = useState<DropTarget | null>(null)
  const pending = useRef<Pending | null>(null)
  const active = useRef<{ id: string; pointerId: number; row: HTMLElement; startY: number; startX: number; target: DropTarget | null; scroller: HTMLElement | null; startScroll: number; lastX: number; lastY: number; raf: ReturnType<typeof setInterval> } | null>(null)
  const drop = useRef(onDrop)
  useEffect(() => {
    drop.current = onDrop
  }, [onDrop])

  const cleanup = useCallback(() => {
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = null
    const a = active.current
    if (a) {
      clearInterval(a.raf)
      a.row.style.transform = ''
    }
    active.current = null
    document.documentElement.classList.remove('list-dragging')
    setDragId(null)
    setTarget(null)
  }, [])

  useEffect(() => {
    // While an item is lifted, a finger moving must drag it, not scroll the page.
    const stopScroll = (e: TouchEvent) => {
      if (active.current) e.preventDefault()
    }
    const move = (e: PointerEvent) => {
      const p = pending.current
      if (p && e.pointerId === p.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP_PX) {
        // Moved before the hold finished: that's a scroll or a swipe.
        clearTimeout(p.timer)
        pending.current = null
        return
      }
      const a = active.current
      if (!a || e.pointerId !== a.pointerId) return
      e.preventDefault()
      a.lastX = e.clientX
      a.lastY = e.clientY
      follow(a, setTarget)
    }
    const up = (e: PointerEvent) => {
      if (pending.current && e.pointerId === pending.current.pointerId) {
        clearTimeout(pending.current.timer)
        pending.current = null
        return
      }
      const a = active.current
      if (!a || e.pointerId !== a.pointerId) return
      const { id, target: t } = a
      // The click that follows letting go mustn't open the editor.
      const swallow = (c: Event) => {
        c.stopPropagation()
        c.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400)
      // Picked up and put back down where it was: nothing to save.
      const moved = Math.hypot(a.lastX - a.startX, a.lastY - a.startY) > SLOP_PX || (a.scroller?.scrollTop ?? 0) !== a.startScroll
      cleanup()
      if (t && moved) drop.current(id, t)
    }
    const cancel = (e: PointerEvent) => {
      if (pending.current?.pointerId === e.pointerId || active.current?.pointerId === e.pointerId) cleanup()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && active.current) cleanup()
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    document.addEventListener('touchmove', stopScroll, { passive: false })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
      document.removeEventListener('touchmove', stopScroll)
      cleanup()
    }
  }, [cleanup])

  /**
   * Spread onto an item row: starts the hold. Pressing the checkbox or a button inside doesn't.
   * Its grip (`.list-item__grip`) lifts the item straight away, with no hold.
   */
  const bind = (id: string) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || active.current) return
      const pressed = e.target as HTMLElement
      if (pressed.closest('input, .list-item__delete')) return
      const row = e.currentTarget
      const { clientX: x, clientY: y, pointerId } = e
      const lift = () => {
        pending.current = null
        const scroller = scrollParent(row)
        active.current = { id, pointerId, row, startX: x, startY: y, target: null, scroller, startScroll: scroller?.scrollTop ?? 0, lastX: x, lastY: y, raf: setInterval(() => undefined, 1e9) }
        document.documentElement.classList.add('list-dragging')
        navigator.vibrate?.(12)
        setDragId(id)
        const t = targetAt(x, y, id)
        active.current.target = t
        setTarget(t)
        // Scroll the panel while the item is held near its top or bottom edge (above the
        // phone's bottom bar, which covers the panel's last stretch).
        clearInterval(active.current.raf)
        active.current.raf = setInterval(() => {
          const a = active.current
          const box = a?.scroller?.getBoundingClientRect()
          if (!a?.scroller || !box) return
          const bar = document.querySelector<HTMLElement>('.rail')?.getBoundingClientRect()
          const bottom = bar && bar.top > box.top + box.height / 2 ? Math.min(box.bottom, bar.top) : box.bottom
          const by = a.lastY < box.top + EDGE_PX ? -12 : a.lastY > bottom - EDGE_PX ? 12 : 0
          if (!by) return
          a.scroller.scrollTop += by
          follow(a, setTarget)
        }, 16)
      }
      if (pressed.closest('.list-item__grip')) {
        // Stops a mouse press from selecting text on the way.
        e.preventDefault()
        lift()
        return
      }
      pending.current = { id, pointerId, x, y, row, timer: setTimeout(lift, HOLD_MS) }
    },
    // A long press would otherwise open the browser's menu or select the text.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    'data-item-id': id,
  })

  return { dragId, target, bind }
}

/** The order value that puts an item at the drop target among the group's other items. */
export function placeFor(others: ListItem[], t: DropTarget): number {
  const sorted = [...others].sort((x, y) => x.order - y.order)
  const at = t.beforeId ? sorted.findIndex((i) => i.id === t.beforeId) : sorted.length
  const i = at < 0 ? sorted.length : at
  const prev = sorted[i - 1]
  const next = sorted[i]
  if (prev && next) return (prev.order + next.order) / 2
  if (next) return next.order - 1
  if (prev) return prev.order + 1
  return Date.now()
}

