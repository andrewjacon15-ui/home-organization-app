import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { FamilySetup } from './components/FamilySetup'
import { NavRail } from './components/NavRail'
import { navFor, TABS, type Tab } from './components/navTabs'
import { SignIn } from './components/SignIn'
import { CalendarPage } from './features/calendar/CalendarPage'
import { ChoresPage } from './features/chores/ChoresPage'
import { MealsPage } from './features/meals/MealsPage'
import { HomePage } from './features/home/HomePage'
import { ListsPage } from './features/lists/ListsPage'
import { LockProvider } from './features/lock/LockContext'
import { SleepProvider } from './features/sleep/SleepContext'
import { PhotosPage } from './features/photos/PhotosPage'
import { ScreensaverProvider } from './features/photos/ScreensaverContext'
import { RecipesPage } from './features/recipes/RecipesPage'
import { ReminderCenter } from './features/reminders/ReminderCenter'
import { RewardsPage } from './features/rewards/RewardsPage'
import { SettingsProvider, useSettings } from './features/settings/SettingsContext'
import { SettingsPage } from './features/settings/SettingsPage'
import { CurrentWeather } from './features/weather/WeatherBadges'
import { WeatherProvider } from './features/weather/WeatherContext'
import { DEFAULT_ACCENT, isHex, readableOn } from './lib/colors'
import { DeviceProvider, useDevice } from './lib/DeviceContext'
import { resolveFamily } from './lib/family'
import { useAuthUser, useFamily, useNow } from './lib/hooks'
import { reloadToLatest, useUpdateCheck } from './lib/version'

const TAB_KEY = 'last-tab'

function initialTab(): Tab {
  try {
    const saved = localStorage.getItem(TAB_KEY)
    return TABS.some((t) => t.id === saved) ? (saved as Tab) : 'home'
  } catch {
    return 'home'
  }
}

export default function App() {
  return (
    <DeviceProvider>
      <Signed />
    </DeviceProvider>
  )
}

function Signed() {
  const user = useAuthUser()
  if (user === undefined) return <Splash />
  if (user === null) return <SignIn />
  return <SignedIn key={user.uid} user={user} />
}

function SignedIn({ user }: { user: User }) {
  // undefined = still looking, null = no family yet
  const [familyId, setFamilyId] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    resolveFamily(user)
      .then(setFamilyId)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [user])

  if (error) {
    return (
      <main className="center-screen">
        <p className="error" role="alert">Couldn't load your family: {error}</p>
      </main>
    )
  }
  if (familyId === undefined) return <Splash />
  if (familyId === null) return <FamilySetup user={user} onCreated={setFamilyId} />
  return (
    <SettingsProvider familyId={familyId}>
      <WeatherProvider>
        <LockProvider familyId={familyId}>
          <SleepProvider>
            <ScreensaverProvider familyId={familyId}>
              <Home familyId={familyId} userId={user.uid} />
            </ScreensaverProvider>
          </SleepProvider>
        </LockProvider>
      </WeatherProvider>
    </SettingsProvider>
  )
}

function Home({ familyId, userId }: { familyId: string; userId: string }) {
  const { family, members } = useFamily(familyId)
  const [tab, setTabState] = useState<Tab>(initialTab)
  const now = useNow()
  const { settings } = useSettings()
  const { device } = useDevice()
  const update = useUpdateCheck({ onMount: true })

  const setTab = (t: Tab) => {
    setTabState(t)
    window.scrollTo(0, 0)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      // Remembering the tab is a convenience only.
    }
  }

  // Theme, highlight color, text size, and density are page-wide CSS variables (see index.css).
  useEffect(() => {
    const root = document.documentElement
    root.dataset.textSize = settings.textSize
    root.dataset.density = settings.density
    root.dataset.theme = settings.theme
    const accent = isHex(settings.accentColor) ? settings.accentColor : DEFAULT_ACCENT
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--accent-ink', readableOn(accent))
  }, [settings.textSize, settings.density, settings.theme, settings.accentColor])

  if (!family) return <Splash />

  // Each kind of device has its own side bar (Settings → Device & side bar).
  const visibleTabs = navFor(settings.hiddenTabs[device])
  // If the section you were on has been hidden here, fall back to the first one shown.
  const shown: Tab = visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0].id

  return (
    <div className="shell">
      <NavRail tabs={visibleTabs} current={shown} title={settings.calendarName || family.name} onSelect={setTab} />

      <div className="app">
        {update.state === 'available' && (
          <div className="update-bar" role="status">
            A new version is ready.
            <button type="button" className="button button--primary" onClick={() => void reloadToLatest()}>
              Reload
            </button>
          </div>
        )}
        <header className="masthead">
          <div className="masthead__date">
            <span className="masthead__day">{now.toLocaleDateString(undefined, { weekday: 'long' })}</span>
            <span className="masthead__short">{now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span className="masthead__full">{now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</span>
          </div>
          <div className="masthead__meta">
            <span className="masthead__time">{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
            <CurrentWeather />
          </div>
          <span className="masthead__name">{settings.calendarName || family.name}</span>
        </header>
        <main className="content">
          {shown === 'home' && <HomePage familyId={familyId} userId={userId} members={members} onNavigate={setTab} />}
          {shown === 'calendar' && <CalendarPage familyId={familyId} userId={userId} members={members} />}
          {shown === 'lists' && <ListsPage familyId={familyId} userId={userId} members={members} />}
          {shown === 'chores' && <ChoresPage familyId={familyId} userId={userId} members={members} />}
          {shown === 'rewards' && <RewardsPage familyId={familyId} userId={userId} members={members} />}
          {shown === 'meals' && <MealsPage familyId={familyId} userId={userId} />}
          {shown === 'recipes' && <RecipesPage familyId={familyId} userId={userId} />}
          {shown === 'photos' && <PhotosPage familyId={familyId} userId={userId} />}
          {shown === 'settings' && <SettingsPage family={family} members={members} userId={userId} />}
        </main>
      </div>
      <ReminderCenter familyId={familyId} members={members} />
    </div>
  )
}

function Splash() {
  return (
    <main className="center-screen">
      <p className="muted">Loading…</p>
    </main>
  )
}
