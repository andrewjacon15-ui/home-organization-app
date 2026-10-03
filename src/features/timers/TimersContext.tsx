import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { holdAwake } from '../../lib/keepAwake'
import { primeAlarm, startAlarm, stopAlarm } from './alarm'
import { advance, timeLeft as leftOf, type KitchenTimer } from './timerState'
import { TimersCtx as Ctx, type TimersValue } from './useTimers'


const STORE = 'kitchen-timers'
function load(): KitchenTimer[] {
  try {
    const raw = localStorage.getItem(STORE)
    const list = raw ? (JSON.parse(raw) as KitchenTimer[]) : []
    return Array.isArray(list) ? list.filter((t) => t && typeof t.id === 'string' && typeof t.total === 'number').slice(0, 20) : []
  } catch {
    return []
  }
}

function save(timers: KitchenTimer[]) {
  try {
    if (timers.length) localStorage.setItem(STORE, JSON.stringify(timers))
    else localStorage.removeItem(STORE)
  } catch {
    // private mode: timers still work until the page reloads
  }
}

/** Kitchen timers for the whole app: they keep running on any screen and survive a reload. */
export function TimersProvider({ children, clock = Date.now }: { children: ReactNode; clock?: () => number }) {
  const [timers, setTimers] = useState<KitchenTimer[]>(() => advance(load(), clock()))
  const [now, setNow] = useState(clock)
  const [panelOpen, setPanelOpen] = useState(false)
  const seq = useRef(0)

  const ticking = timers.some((t) => t.state === 'running' || t.state === 'ringing')
  useEffect(() => {
    if (!ticking) return
    const tick = () => {
      const t = clock()
      setNow(t)
      setTimers((list) => advance(list, t))
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [ticking, clock])

  useEffect(() => save(timers), [timers])

  // The alarm rings while any timer is ringing, and keeps the screen awake (our sleep mode
  // and photo screensaver step aside).
  const ringing = timers.some((t) => t.state === 'ringing')
  useEffect(() => {
    if (!ringing) return
    startAlarm()
    const release = holdAwake()
    return () => {
      stopAlarm()
      release()
    }
  }, [ringing])

  const update = useCallback((id: string, f: (t: KitchenTimer, now: number) => KitchenTimer | null) => {
    const at = clock()
    setNow(at)
    setTimers((list) => list.flatMap((t) => (t.id === id ? (f(t, at) ?? []) : [t])))
  }, [clock])

  const value = useMemo<TimersValue>(
    () => ({
      timers,
      now,
      add: (label, seconds, opts = {}) => {
        const at = clock()
        const id = `t${at.toString(36)}${(seq.current++).toString(36)}`
        if (opts.start) primeAlarm()
        const s = Math.max(1, Math.round(seconds))
        setNow(at)
        setTimers((list) => [
          ...list,
          { id, label: label.trim().slice(0, 60) || 'Timer', total: s, state: opts.start ? 'running' : 'ready', endsAt: opts.start ? at + s * 1000 : null, leftMs: s * 1000, source: opts.source },
        ])
        return id
      },
      start: (id) => {
        primeAlarm()
        update(id, (t, at) => (t.state === 'ready' || t.state === 'paused' ? { ...t, state: 'running', endsAt: at + t.leftMs } : t))
      },
      pause: (id) => update(id, (t, at) => (t.state === 'running' ? { ...t, state: 'paused', leftMs: leftOf(t, at), endsAt: null } : t)),
      addTime: (id, seconds) =>
        update(id, (t, at) => {
          const ms = seconds * 1000
          if (t.state === 'running' && t.endsAt != null) return { ...t, endsAt: t.endsAt + ms, total: t.total + seconds }
          // "+1 min" on a ringing timer snoozes it.
          if (t.state === 'ringing' || t.state === 'done') return { ...t, state: 'running', endsAt: at + ms, leftMs: ms, rangAt: undefined }
          return { ...t, leftMs: t.leftMs + ms, total: t.total + seconds }
        }),
      dismiss: (id) => update(id, () => null),
      hasSource: (source) => timers.some((t) => t.source === source),
      panelOpen,
      setPanelOpen,
    }),
    [timers, now, panelOpen, clock, update],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
