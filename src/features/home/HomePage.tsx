import { useEffect, useMemo, useState } from 'react'
import { addDays, fromDateKey, startOfWeek } from '../../lib/dates'
import { useNow, useToday } from '../../lib/hooks'
import { useFitHeight } from '../../lib/useFitHeight'
import type { CalendarEvent, Chore, Member, SyncedCalendar } from '../../types'
import { watchCalendars, watchEvents } from '../calendar/calendarApi'
import { applyFilter, loadHidden } from '../calendar/filter'
import { deleteChore, setOccurrenceDone, watchChores } from '../chores/choresApi'
import { addItems, ensureDefaultLists, setItemDone, watchItems, watchLists, type FamilyList, type ListItem } from '../lists/listsApi'
import { useDevice } from '../../lib/DeviceContext'
import { useSettings } from '../settings/SettingsContext'
import { addCountdown, removeCountdown, watchCountdowns, type Countdown } from '../countdowns/countdownsApi'
import { homeCalendarDays, homePanelsFor } from './homePanels'
import { HomeView, type HomeTarget } from './HomeView'

interface Props {
  familyId: string
  userId: string
  members: Member[]
  onNavigate: (target: HomeTarget) => void
}

export function HomePage({ familyId, userId, members, onNavigate }: Props) {
  const { settings, update } = useSettings()
  const { device } = useDevice()
  const panels = homePanelsFor(settings.homePanels, device, settings.homePanelsVersion)
  const calendarDays = homeCalendarDays(settings.homeCalendarDays)
  // Hidden panels don't load their data, so they cost no reads.
  const showCalendar = panels.includes('calendar')
  const showTasks = panels.includes('tasks')
  const showLists = panels.includes('lists')
  const showCountdowns = panels.includes('countdowns')
  const [countdowns, setCountdowns] = useState<Countdown[]>([])
  const today = useToday()
  const now = useNow()
  // A week follows the calendar's week setting; 1 or 3 days always start today.
  const start = calendarDays === 7 && !settings.weekStartToday ? startOfWeek(today, settings.weekStartsOn) : today
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [calendars, setCalendars] = useState<SyncedCalendar[]>([])
  const [chores, setChores] = useState<Chore[]>([])
  const [lists, setLists] = useState<FamilyList[]>([])
  const [items, setItems] = useState<Record<string, ListItem[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [fitRef, fitStyle] = useFitHeight<HTMLDivElement>(true)
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  useEffect(() => {
    if (showCalendar) return watchEvents(familyId, fromDateKey(start), fromDateKey(addDays(start, calendarDays + 7)), setEvents)
  }, [familyId, start, calendarDays, showCalendar])
  useEffect(() => {
    if (showCalendar) return watchCalendars(familyId, setCalendars)
  }, [familyId, showCalendar])
  useEffect(() => {
    if (showCountdowns) return watchCountdowns(familyId, setCountdowns)
  }, [familyId, showCountdowns])
  useEffect(() => {
    if (showTasks) return watchChores(familyId, setChores)
  }, [familyId, showTasks])
  useEffect(() => {
    if (!showLists) return
    ensureDefaultLists(familyId, userId).catch(() => undefined)
    return watchLists(familyId, setLists)
  }, [familyId, userId, showLists])
  const shownIds = (showLists ? lists : [])
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
        start={start}
        calendarDays={calendarDays}
        onCalendarDays={(n) => void update({ homeCalendarDays: n })}
        events={visible}
        calendars={calendars}
        members={members}
        chores={chores}
        lists={lists}
        items={items}
        onNavigate={onNavigate}
        panels={panels}
        countdowns={countdowns}
        onAddCountdown={(title, date, kind) => addCountdown(familyId, userId, title, date, kind).catch(report)}
        countdownHolidays={settings.countdownHolidays}
        onRemoveCountdown={(c) => removeCountdown(familyId, c.id).catch(report)}
        onToggleChore={(o, done, doneBy) => setOccurrenceDone(familyId, o, done, doneBy, userId, today).catch(report)}
        onDeleteChore={(c) => deleteChore(familyId, c.id).catch(report)}
        onAddItem={(l, text) => addItems(familyId, l.id, userId, [text], null, { categories: l.categories }).catch(report)}
        onToggleItem={(l, i) => setItemDone(familyId, l.id, i.id, !i.done, settings.listDoneDays).catch(report)}
      />
    </div>
  )
}
