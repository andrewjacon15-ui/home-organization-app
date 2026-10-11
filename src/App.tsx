import type { User } from 'firebase/auth'
import { lazy, Suspense, useEffect, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FamilySetup } from './components/FamilySetup'
import { OfflineIcon } from './components/Icons'
import { NavRail } from './components/NavRail'
import { navFor, TABS, type Tab } from './components/navTabs'
import { SignIn } from './components/SignIn'
import { HomePage } from './features/home/HomePage'
import { LockProvider } from './features/lock/LockContext'
import { SleepProvider } from './features/sleep/SleepContext'
import { ScreensaverProvider } from './features/photos/ScreensaverContext'
import { ReminderCenter } from './features/reminders/ReminderCenter'
import { AlarmOverlay, TimerButton, TimerDock, TimerPanel } from './features/timers/Timers'
import { TimersProvider } from './features/timers/TimersContext'
import { UndoProvider } from './components/UndoToast'
import { SettingsProvider, useSettings } from './features/settings/SettingsContext'
import { textSizeFor } from './features/settings/settingsApi'
import { CurrentWeather } from './features/weather/WeatherBadges'
import { WeatherProvider } from './features/weather/WeatherContext'
import { DEFAULT_ACCENT, isHex, mixHex, readableOn, withAlpha } from './lib/colors'
import { DeviceProvider, useDevice } from './lib/DeviceContext'
import { markWelcomed, resolveFamily } from './lib/family'
import { detectPlatform, rememberWelcomed, shouldWelcome, tourSteps } from './features/welcome/welcome'
import { WelcomeTour } from './features/welcome/WelcomeTour'
import { useAuthUser, useFamily, useNow, useOffline } from './lib/hooks'
import { reloadToLatest, useUpdateCheck } from './lib/version'

// Home loads with the app (it's the wall display's start page); every other section loads
// the first time it's opened, which keeps the first load small.
const CalendarPage = lazy(() => import('./features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })))
const ChoresPage = lazy(() => import('./features/chores/ChoresPage').then((m) => ({ default: m.ChoresPage })))
const MealsPage = lazy(() => import('./features/meals/MealsPage').then((m) => ({ default: m.MealsPage })))
const ListsPage = lazy(() => import('./features/lists/ListsPage').then((m) => ({ default: m.ListsPage })))
const PhotosPage = lazy(() => import('./features/photos/PhotosPage').then((m) => ({ default: m.PhotosPage })))
const RecipesPage = lazy(() => import('./features/recipes/RecipesPage').then((m) => ({ default: m.RecipesPage })))
const RewardsPage = lazy(() => import('./features/rewards/RewardsPage').then((m) => ({ default: m.RewardsPage })))
const WeatherPage = lazy(() => import('./features/weather/WeatherPage').then((m) => ({ default: m.WeatherPage })))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const TAB_KEY = 'last-tab'
/** The household's theme, text size, density and highlight color from last time (read by index.html). */
const LOOK_KEY = 'look'

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
    <ErrorBoundary full>
      <DeviceProvider>
        <Signed />
      </DeviceProvider>
    </ErrorBoundary>
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
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    resolveFamily(user).then(
      (id) => {
        if (!live) return
        setError(null)
        setFamilyId(id)
      },
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      live = false
    }
  }, [user, attempt])

  // Often the wall tablet starting up before its Wi-Fi has: keep trying, sooner once it's back online.
  useEffect(() => {
    if (!error) return
    const again = () => setAttempt((n) => n + 1)
    const t = setTimeout(again, retryDelay(attempt))
    window.addEventListener('online', again)
    return () => {
      clearTimeout(t)
      window.removeEventListener('online', again)
    }
  }, [error, attempt])

  if (error) {
    return (
      <main className="center-screen">
        <div className="crash card" role="alert">
          <h2 className="crash__title">Can’t reach your household right now.</h2>
          <p>Trying again by itself. Check that this device is online.</p>
          <div className="row">
            <button type="button" className="button button--primary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
          <p className="crash__detail">{error}</p>
        </div>
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
              <TimersProvider>
                <UndoProvider>
                  <Home familyId={familyId} userId={user.uid} />
                </UndoProvider>
              </TimersProvider>
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
  const offline = useOffline(familyId)
  const { settings } = useSettings()
  const { device } = useDevice()
  const update = useUpdateCheck({ onMount: true })
  // Each kind of device can open to a set tab (Settings → Device & side bar). Applied once,
  // when the household's settings first arrive, so changing it later doesn't jump you there.
  const startTab = settings.startTab[device]
  const [starting, setStarting] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setStarting(false), 5000)
    return () => clearTimeout(t)
  }, [])
  if (starting && startTab) {
    setStarting(false)
    if (TABS.some((t) => t.id === startTab)) setTabState(startTab as Tab)
  }
  // New people get the welcome tour once; anyone can replay it from Settings → About.
  const [tour, setTour] = useState<boolean | null>(null)
  const me = members.find((m) => m.id === userId)
  const showTour = tour ?? shouldWelcome(me, familyId, userId)
  const closeTour = () => {
    setTour(false)
    rememberWelcomed(familyId, userId)
    if (me && !me.welcomedAt) markWelcomed(familyId, userId).catch(() => undefined)
  }

  const setTab = (t: Tab) => {
    setTabState(t)
    // The main panel scrolls, not the page.
    document.querySelector('.app')?.scrollTo?.(0, 0)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      // Remembering the tab is a convenience only.
    }
  }

  // Theme, highlight color, text size, and density are page-wide CSS variables (see index.css).
  const textSize = textSizeFor(settings, device)
  useEffect(() => {
    const root = document.documentElement
    root.dataset.textSize = textSize
    root.dataset.density = settings.density
    root.dataset.theme = settings.theme
    const accent = isHex(settings.accentColor) ? settings.accentColor : DEFAULT_ACCENT
    const vars = {
      '--accent': accent,
      '--accent-ink': readableOn(accent),
      '--accent-soft': withAlpha(accent, 0.12),
      // Lifted toward white so accent-colored text stays readable on dark backgrounds.
      '--accent-text-dark': mixHex(accent, '#ffffff', 0.45),
    }
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
    // Remembered for next time, so the page opens in these colors and sizes before settings load (index.html).
    try {
      localStorage.setItem(LOOK_KEY, JSON.stringify({ theme: settings.theme, textSize, density: settings.density, vars }))
    } catch {
      // Only saves a flash of the default look on the next start.
    }
  }, [textSize, settings.density, settings.theme, settings.accentColor])

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
            {offline && (
              <span className="masthead__offline" role="status" title="Showing what this device saved. Changes made here go out when it’s back online.">
                <OfflineIcon size={18} aria-hidden /> Offline
              </span>
            )}
            <span className="masthead__time">{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
            <button type="button" className="masthead__weather" onClick={() => setTab('weather')} aria-label="Open the forecast">
              <CurrentWeather />
            </button>
            <TimerButton />
          </div>
          <span className="masthead__name">{settings.calendarName || family.name}</span>
        </header>
        <main className="content">
          {/* A page that breaks shows a note in its place; the side bar and other pages keep working. */}
          <ErrorBoundary key={shown}>
          <Suspense fallback={<p className="muted">Loading…</p>}>
          {shown === 'home' && <HomePage familyId={familyId} userId={userId} members={members} onNavigate={setTab} />}
          {shown === 'calendar' && <CalendarPage familyId={familyId} userId={userId} members={members} />}
          {shown === 'lists' && <ListsPage familyId={familyId} userId={userId} members={members} />}
          {shown === 'chores' && <ChoresPage familyId={familyId} userId={userId} members={members} />}
          {shown === 'rewards' && <RewardsPage familyId={familyId} userId={userId} members={members} />}
          {shown === 'meals' && <MealsPage familyId={familyId} userId={userId} />}
          {shown === 'recipes' && <RecipesPage familyId={familyId} userId={userId} />}
          {shown === 'weather' && <WeatherPage />}
          {shown === 'photos' && <PhotosPage familyId={familyId} userId={userId} />}
          {shown === 'settings' && <SettingsPage family={family} members={members} userId={userId} onOpenRecipes={() => setTab('recipes')} onShowTour={() => setTour(true)} />}
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      {showTour && <WelcomeTour steps={tourSteps(settings.calendarName || family.name, device, detectPlatform())} onNavigate={setTab} onClose={closeTour} />}
      <ReminderCenter familyId={familyId} members={members} />
      <TimerDock />
      <TimerPanel />
      <AlarmOverlay />
    </div>
  )
}

/** 5 s, 10 s, 20 s, 40 s, then every minute. */
function retryDelay(attempt: number): number {
  return Math.min(60_000, 5_000 * 2 ** attempt)
}

function Splash() {
  return (
    <main className="center-screen">
      <p className="muted">Loading…</p>
    </main>
  )
}
