import { createContext, useContext } from 'react'
import type { KitchenTimer } from './timerState'

export interface TimersValue {
  timers: KitchenTimer[]
  now: number
  /** Adds a timer; `start` runs it at once (from a tap). Returns its id. */
  add: (label: string, seconds: number, opts?: { start?: boolean; source?: string }) => string
  start: (id: string) => void
  pause: (id: string) => void
  addTime: (id: string, seconds: number) => void
  /** Stops a ringing timer, or removes any timer. */
  dismiss: (id: string) => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
}

export const TimersCtx = createContext<TimersValue | null>(null)

/** The kitchen timers (needs a TimersProvider above). */
export function useTimers(): TimersValue {
  const v = useContext(TimersCtx)
  if (!v) throw new Error('useTimers needs a TimersProvider')
  return v
}
