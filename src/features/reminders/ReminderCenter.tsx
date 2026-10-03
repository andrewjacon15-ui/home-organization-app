import { CloseIcon } from '../../components/Icons'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { CalendarEvent, Chore, Member } from '../../types'
import { watchEvents } from '../calendar/calendarApi'
import { watchChores } from '../chores/choresApi'
import { useNow } from '../../lib/hooks'
import { useSettings } from '../settings/SettingsContext'
import { playChime, unlockAudioOnFirstTouch } from './chime'
import { remindersBetween, type Reminder } from './reminders'

const TICK_MS = 15_000
const FIRED_KEY = 'reminders-fired-v1'
const MAX_VISIBLE = 4

function loadFired(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function saveFired(keys: string[]) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(keys.slice(-300)))
  } catch {
    // Without storage a reload could repeat a reminder; acceptable.
  }
}

/** Watches upcoming events and chores and pops up reminders on this screen. */
export function ReminderCenter({ familyId, members }: { familyId: string; members: Member[] }) {
  const { settings } = useSettings()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [chores, setChores] = useState<Chore[]>([])
  const [alerts, setAlerts] = useState<Reminder[]>([])
  // Start a minute back so a reminder due right as the app loads still shows.
  const lastCheck = useRef<Date | null>(null)
  // Re-anchor the watched window every hour so a long-running display keeps looking two days ahead.
  const hour = Math.floor(useNow(60_000).getTime() / 3_600_000)

  useEffect(() => {
    const start = hour * 3_600_000
    return watchEvents(familyId, new Date(start - 3_600_000), new Date(start + 2 * 86_400_000), setEvents, 0)
  }, [familyId, hour])
  useEffect(() => watchChores(familyId, setChores), [familyId])
  useEffect(() => unlockAudioOnFirstTouch(), [])

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      lastCheck.current ??= new Date(now.getTime() - 60_000)
      const fired = loadFired()
      const due = remindersBetween(events, chores, settings, lastCheck.current, now).filter((r) => !fired.includes(r.key))
      lastCheck.current = now
      if (due.length === 0) return
      saveFired([...fired, ...due.map((r) => r.key)])
      setAlerts((current) => [...current, ...due].slice(-MAX_VISIBLE))
      if (settings.reminderSound) playChime()
    }
    tick()
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [events, chores, settings])

  return <ReminderToasts alerts={alerts} members={members} onDismiss={(key) => setAlerts((a) => a.filter((r) => r.key !== key))} />
}

export function ReminderToasts({ alerts, members, onDismiss }: { alerts: Reminder[]; members: Member[]; onDismiss: (key: string) => void }) {
  if (alerts.length === 0) return null
  const byId = new Map(members.map((m) => [m.id, m]))
  return (
    <div className="toasts" role="region" aria-label="Reminders" aria-live="assertive">
      {alerts.map((r) => {
        const owners = r.ownerIds.map((id) => byId.get(id)).filter((m) => m !== undefined)
        return (
          <div key={r.key} className="toast" role="alert" style={{ '--pill': owners[0]?.color ?? 'var(--accent)' } as CSSProperties}>
            <div className="toast__body">
              <strong>{r.title}</strong>
              <span className="muted">
                {r.detail}
                {owners.length > 0 && ` · ${owners.map((m) => m.displayName.split(' ')[0]).join(', ')}`}
              </span>
            </div>
            <button type="button" className="icon-button" onClick={() => onDismiss(r.key)} aria-label={`Dismiss reminder for ${r.title}`}>
              <CloseIcon size={18} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
