import type { User } from 'firebase/auth'
import { useEffect, useState, type ReactElement, type SVGProps } from 'react'
import { FamilySetup } from './components/FamilySetup'
import { CalendarIcon, ChoresIcon, HomeIcon, ListsIcon, MealsIcon, PhotosIcon, RecipesIcon, RewardsIcon, SettingsIcon } from './components/Icons'
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
import { resolveFamily } from './lib/family'
import { useAuthUser, useFamily, useNow } from './lib/hooks'
import { reloadToLatest, useUpdateCheck } from './lib/version'

type Tab = 'home' | 'calendar' | 'lists' | 'chores' | 'rewards' | 'meals' | 'recipes' | 'photos' | 'settings'

const TABS: { id: Tab; label: string; Icon: (p: SVGProps<SVGSVGElement>) => ReactElement }[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'calendar', label: 'Calendar', Icon: CalendarIcon },
  { id: 'lists', label: 'Lists', Icon: ListsIcon },
  { id: 'chores', label: 'Chores', Icon: ChoresIcon },
  { id: 'rewards', label: 'Rewards', Icon: RewardsIcon },
  { id: 'meals', label: 'Meals', Icon: MealsIcon },
  { id: 'recipes', label: 'Recipes', Icon: RecipesIcon },
  { id: 'photos', label: 'Photos', Icon: PhotosIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
]

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
  const update = useUpdateCheck({ onMount: true })

  const setTab = (t: Tab) => {
    setTabState(t)
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

  return (
    <div className="shell">
      <nav className="rail" aria-label="Sections">
        <span className="rail__mark" aria-hidden>
          {(settings.calendarName || family.name).replace(/^the\s+/i, '').charAt(0)}
        </span>
        {TABS.filter((t) => t.id !== 'photos' || settings.showPhotosTab).map(({ id, label, Icon }) => (
          <button key={id} type="button" className={`rail__item${tab === id ? ' rail__item--active' : ''}`} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

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
            <span className="masthead__full">{now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</span>
          </div>
          <div className="masthead__meta">
            <span className="masthead__time">{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
            <CurrentWeather />
          </div>
          <span className="masthead__name">{settings.calendarName || family.name}</span>
        </header>
        <main className="content">
          {tab === 'home' && <HomePage familyId={familyId} userId={userId} members={members} onNavigate={setTab} />}
          {tab === 'calendar' && <CalendarPage familyId={familyId} userId={userId} members={members} />}
          {tab === 'lists' && <ListsPage familyId={familyId} userId={userId} members={members} />}
          {tab === 'chores' && <ChoresPage familyId={familyId} userId={userId} members={members} />}
          {tab === 'rewards' && <RewardsPage familyId={familyId} userId={userId} members={members} />}
          {tab === 'meals' && <MealsPage familyId={familyId} userId={userId} />}
          {tab === 'recipes' && <RecipesPage familyId={familyId} userId={userId} />}
          {tab === 'photos' && <PhotosPage familyId={familyId} userId={userId} />}
          {tab === 'settings' && <SettingsPage family={family} members={members} userId={userId} />}
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
