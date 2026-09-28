import { useEffect, useMemo, useState } from 'react'
import { addDays, fromDateKey, startOfWeek } from '../../lib/dates'
import { useNow, useToday } from '../../lib/hooks'
import { useFitHeight } from '../../lib/useFitHeight'
import type { CalendarEvent, Chore, Member, SyncedCalendar } from '../../types'
import { watchCalendars, watchEvents } from '../calendar/calendarApi'
import { applyFilter, loadHidden } from '../calendar/filter'
import { deleteChore, setOccurrenceDone, watchChores } from '../chores/choresApi'
import { addItems, ensureDefaultLists, setItemDone, watchItems, watchLists, type FamilyList, type ListItem } from '../lists/listsApi'
import { useSettings } from '../settings/SettingsContext'
import { HomeView, type HomeTarget } from './HomeView'

interface Props {
  familyId: string
  userId: string
  members: Member[]
  onNavigate: (target: HomeTarget) => void
}

export function HomePage({ familyId, userId, members, onNavigate }: Props) {
  const { settings } = useSettings()
  const today = useToday()
  const now = useNow()
  const weekStart = settings.weekStartToday ? today : startOfWeek(today, settings.weekStartsOn)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [calendars, setCalendars] = useState<SyncedCalendar[]>([])
  const [chores, setChores] = useState<Chore[]>([])
  const [lists, setLists] = useState<FamilyList[]>([])
  const [items, setItems] = useState<Record<string, ListItem[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [fitRef, fitStyle] = useFitHeight<HTMLDivElement>(true)
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  useEffect(() => watchEvents(familyId, fromDateKey(weekStart), fromDateKey(addDays(weekStart, 14)), setEvents), [familyId, weekStart])
  useEffect(() => watchCalendars(familyId, setCalendars), [familyId])
  useEffect(() => watchChores(familyId, setChores), [familyId])
  useEffect(() => {
    ensureDefaultLists(familyId, userId).catch(() => undefined)
    return watchLists(familyId, setLists)
  }, [familyId, userId])
  const shownIds = lists
    .slice(0, 2)
    .map((l) => l.id)
    .join(',')
  useEffect(() => {
    const ids = shownIds ? shownIds.split(',') : []
    const stops = ids.map((id) => watchItems(familyId, id, (next) => setItems((cur) => ({ ...cur, [id]: next }))))
    return () => stops.forEach((s) => s())
  }, [familyId, shownIds])

  // Same per-device filter as the Calendar tab.
  const calendarByKey = useMemo(() => new Map(calendars.map((c) => [c.key, c])), [calendars])
  const visible = useMemo(() => applyFilter(events, loadHidden(), calendarByKey), [events, calendarByKey])

  return (
    <div ref={fitRef} style={fitStyle} className="home-fit">
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <HomeView
        today={today}
        now={now}
        weekStart={weekStart}
        events={visible}
        calendars={calendars}
        members={members}
        chores={chores}
        lists={lists}
        items={items}
        onNavigate={onNavigate}
        onToggleChore={(o, done, doneBy) => setOccurrenceDone(familyId, o, done, doneBy, userId, today).catch(report)}
        onDeleteChore={(c) => deleteChore(familyId, c.id).catch(report)}
        onAddItem={(l, text) => addItems(familyId, l.id, userId, [text]).catch(report)}
        onToggleItem={(l, i) => setItemDone(familyId, l.id, i.id, !i.done).catch(report)}
      />
    </div>
  )
}
