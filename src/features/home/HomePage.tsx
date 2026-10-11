import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
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
import { addCountdown, removeCountdown, watchCountdowns, watchGoogleSpecials, type Countdown, type GoogleSpecial } from '../countdowns/countdownsApi'
import { requestSettingsSection } from '../settings/openSection'
import { homeCalendarDays, homePanelsFor } from './homePanels'
import type { HomeTarget } from './HomeView'
import { DailySummary } from './DailySummary'
import { homeStyleFor } from '../settings/settingsApi'
import { occurrencesOn } from '../chores/schedule'
import { shownCountdowns } from '../countdowns/countdownsApi'
import { withOwners } from '../calendar/views'
import { watchMealPlans } from '../meals/mealsApi'
import type { MealPlan } from '../../types'
import { useUndo } from '../../lib/undo'

// The panels view loads only on a device that uses it (the daily summary is the default).
const HomeView = lazy(() => import('./HomeView').then((m) => ({ default: m.HomeView })))

interface Props {
  familyId: string
  userId: string
  members: Member[]
  onNavigate: (target: HomeTarget) => void
}

export function HomePage({ familyId, userId, members, onNavigate }: Props) {
  const { offer } = useUndo()
  const { settings, update } = useSettings()
  const { device } = useDevice()
  // The daily summary (default) or the panels chosen in Settings → Home screen.
  const summary = homeStyleFor(settings, device) === 'summary'
  const panels = homePanelsFor(settings.homePanels, device, settings.homePanelsVersion)
  const calendarDays = homeCalendarDays(settings.homeCalendarDays)
  // Hidden panels don't load their data, so they cost no reads.
  const showCalendar = summary || panels.includes('calendar')
  const showTasks = summary || panels.includes('tasks')
  const showLists = summary || panels.includes('lists')
  const showCountdowns = summary || panels.includes('countdowns')
  const [countdowns, setCountdowns] = useState<Countdown[]>([])
  const [birthdays, setBirthdays] = useState<GoogleSpecial[]>([])
  const showBirthdays = showCountdowns && settings.countdownGoogle
  const today = useToday()
  const now = useNow()
  // A week follows the calendar's week setting; 1 or 3 days always start today.
  // The summary needs today and tomorrow (from a week back, for all-day events still going).
  const start = summary ? addDays(today, -7) : calendarDays === 7 && !settings.weekStartToday ? startOfWeek(today, settings.weekStartsOn) : today
  const span = summary ? 9 : calendarDays + 7
  const [meals, setMeals] = useState<Record<string, MealPlan>>({})
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [calendars, setCalendars] = useState<SyncedCalendar[]>([])
  const [chores, setChores] = useState<Chore[]>([])
  // null until the first read, so Home never says "No lists yet" while they load.
  const [lists, setLists] = useState<FamilyList[] | null>(null)
  const [items, setItems] = useState<Record<string, ListItem[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [fitRef, fitStyle] = useFitHeight<HTMLDivElement>(true)
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  useEffect(() => {
    if (showCalendar) return watchEvents(familyId, fromDateKey(start), fromDateKey(addDays(start, span)), setEvents)
  }, [familyId, start, span, showCalendar])
  useEffect(() => {
    if (summary) return watchMealPlans(familyId, today, addDays(today, 1), setMeals)
  }, [familyId, today, summary])
  useEffect(() => {
    if (showCalendar) return watchCalendars(familyId, setCalendars)
  }, [familyId, showCalendar])
  useEffect(() => {
    if (showCountdowns) return watchCountdowns(familyId, setCountdowns)
  }, [familyId, showCountdowns])
  useEffect(() => {
    if (showBirthdays) return watchGoogleSpecials(familyId, setBirthdays)
  }, [familyId, showBirthdays])
  const google = showBirthdays ? birthdays : []
  useEffect(() => {
    if (showTasks) return watchChores(familyId, setChores)
  }, [familyId, showTasks])
  useEffect(() => {
    if (!showLists) return
    ensureDefaultLists(familyId, userId).catch(() => undefined)
    return watchLists(familyId, setLists)
  }, [familyId, userId, showLists])
  // Panels show the first two lists; the summary only needs the grocery list.
  const shownIds = (showLists ? (lists ?? []) : [])
    .filter((l, i) => (summary ? l.kind === 'grocery' : i < 2))
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

  const owned = useMemo(() => withOwners(visible, calendarByKey), [visible, calendarByKey])
  const groceryId = (lists ?? []).find((l) => l.kind === 'grocery')?.id
  const groceryOpen = groceryId && items[groceryId] ? items[groceryId].filter((i) => !i.done) : lists === null || (groceryId && !items[groceryId]) ? null : []

  if (summary) {
    return (
      <div ref={fitRef} style={fitStyle} className="home-fit home-fit--summary">
        {error && (
          <p className="error" role="alert">
            {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
          </p>
        )}
        <DailySummary
          today={today}
          now={now}
          events={owned}
          members={members}
          calendars={calendars}
          chores={occurrencesOn(chores, today, today)}
          dinner={meals[today]?.dinner ?? ''}
          tomorrowDinner={meals[addDays(today, 1)]?.dinner ?? ''}
          grocery={groceryOpen}
          countdowns={shownCountdowns(countdowns, today, { holidays: settings.countdownHolidays, google })}
          onNavigate={(t) => {
            if (t === 'countdowns') {
              requestSettingsSection('countdowns')
              onNavigate('settings')
            } else onNavigate(t)
          }}
          onToggleChore={(o, done, doneBy) => setOccurrenceDone(familyId, o, done, doneBy, userId, today).catch(report)}
        />
      </div>
    )
  }

  return (
    <div ref={fitRef} style={fitStyle} className="home-fit">
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <Suspense fallback={null}>
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
        lists={lists ?? []}
        listsLoading={lists === null}
        items={items}
        onNavigate={onNavigate}
        panels={panels}
        countdowns={countdowns}
        onAddCountdown={(title, date, kind) => addCountdown(familyId, userId, title, date, kind).catch(report)}
        countdownHolidays={settings.countdownHolidays}
        countdownGoogle={google}
        onRemoveCountdown={(c) => removeCountdown(familyId, c.id).then((r) => offer(`Removed “${c.title}”`, r), report)}
        onToggleChore={(o, done, doneBy) => setOccurrenceDone(familyId, o, done, doneBy, userId, today).catch(report)}
        onDeleteChore={(c) => deleteChore(familyId, c.id).then((r) => offer(`Deleted “${c.title}”`, r), report)}
        onAddItem={(l, text) => addItems(familyId, l.id, userId, [text], null, { list: l }).catch(report)}
        onToggleItem={(l, i) => setItemDone(familyId, l.id, i.id, !i.done, settings.listDoneDays).catch(report)}
      />
      </Suspense>
    </div>
  )
}
