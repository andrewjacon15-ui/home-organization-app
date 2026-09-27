import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { FamilySetup } from './components/FamilySetup'
import { SignIn } from './components/SignIn'
import { CalendarPage } from './features/calendar/CalendarPage'
import { ChoresPage } from './features/chores/ChoresPage'
import { FamilyPage } from './features/family/FamilyPage'
import { MealsPage } from './features/meals/MealsPage'
import { resolveFamily } from './lib/family'
import { useAuthUser, useFamily, useNow } from './lib/hooks'

type Tab = 'calendar' | 'chores' | 'meals' | 'family'

const TABS: { id: Tab; label: string }[] = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'chores', label: 'Chores' },
  { id: 'meals', label: 'Meals' },
  { id: 'family', label: 'Family' },
]

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
  return <Home familyId={familyId} userId={user.uid} />
}

function Home({ familyId, userId }: { familyId: string; userId: string }) {
  const { family, members } = useFamily(familyId)
  const [tab, setTab] = useState<Tab>('calendar')
  const now = useNow()

  if (!family) return <Splash />

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="clock">{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
          <div className="muted">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={`tab${tab === t.id ? ' tab--active' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="content">
        {tab === 'calendar' && <CalendarPage familyId={familyId} userId={userId} members={members} />}
        {tab === 'chores' && <ChoresPage familyId={familyId} userId={userId} members={members} />}
        {tab === 'meals' && <MealsPage familyId={familyId} userId={userId} />}
        {tab === 'family' && <FamilyPage family={family} members={members} userId={userId} />}
      </main>
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
