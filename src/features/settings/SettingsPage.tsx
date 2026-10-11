import type { Family, Member } from '../../types'
import { FamilyPage } from '../family/FamilyPage'
import { saveLock } from '../lock/lockApi'
import { useLock } from '../lock/LockContext'
import { PinPad } from '../lock/PinPad'
import { AdminPage } from '../admin/HouseholdsAdmin'
import { ADMIN_SECTIONS, adminApi, type AdminApi } from '../admin/householdInvites'
import { useIsAdmin } from '../admin/useIsAdmin'
import { useEffect, useRef, useState } from 'react'
import { useSettingsSearch } from './useSettingsSearch'
import { CloseIcon, SearchIcon } from '../../components/Icons'
import { AboutSettings } from './AboutSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { CookbookSettings } from '../cookbooks/CookbookSettings'
import { CountdownSettings } from './CountdownSettings'
import { takeSettingsSection } from './openSection'
import { requestRecipesFilter } from '../recipes/recipesFilter'
import { CalendarLinks } from './CalendarLinks'
import { CalendarSettings } from './CalendarSettings'
import { DeviceSettings } from './DeviceSettings'
import { EmailReminderSettings } from './EmailReminderSettings'
import { GeneralSettings } from './GeneralSettings'
import { GoogleCalendarSettings } from './GoogleCalendarSettings'
import { HomeScreenSettings } from './HomeScreenSettings'
import { KitchenSettings } from './KitchenSettings'
import { LockSettings } from './LockSettings'
import { PeopleViewSettings } from './PeopleViewSettings'
import { ReminderSettings } from './ReminderSettings'
import { ScreensaverSettings } from './ScreensaverSettings'
import { SleepSettings } from './SleepSettings'

interface Props {
  family: Family
  members: Member[]
  userId: string
  /** Opens another section of the app (Cookbooks → review list). */
  onOpenRecipes?: () => void
  /** Replays the welcome tour. */
  onShowTour?: () => void
  adminApiOverride?: AdminApi
}

const SECTIONS = [
  { id: 'family', label: 'Family' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'device', label: 'Device & side bar' },
  { id: 'home', label: 'Home screen' },
  { id: 'countdowns', label: 'Countdowns' },
  { id: 'people', label: 'Lists & chores' },
  { id: 'general', label: 'Weather' },
  { id: 'display', label: 'Display' },
  { id: 'google', label: 'Google Calendar' },
  { id: 'links', label: 'Calendar links' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'email', label: 'Email reminders' },
  { id: 'cookbooks', label: 'Cookbooks' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'photos', label: 'Photos & screensaver' },
  { id: 'sleep', label: 'Sleep mode' },
  { id: 'lock', label: 'Parental lock' },
  { id: 'about', label: 'About' },
]

export function SettingsPage({ family, members, userId, onOpenRecipes, onShowTour, adminApiOverride = adminApi }: Props) {
  const { locked, unlock } = useLock()
  const isAdmin = useIsAdmin(adminApiOverride)
  const [view, setView] = useState<'household' | 'admin'>('household')
  const admin = isAdmin && view === 'admin'
  const sections = admin ? ADMIN_SECTIONS : SECTIONS
  const [query, setQuery] = useState('')
  const pageRef = useRef<HTMLDivElement>(null)
  const indexRef = useRef<HTMLOListElement>(null)

  useSettingsSearch(pageRef, indexRef, query, admin)

  // Opened from somewhere else at one section (Home's Countdowns → Edit).
  useEffect(() => {
    const id = takeSettingsSection()
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [])

  if (locked) {
    return (
      <div className="lock-screen">
        <PinPad title="Settings are locked" hint="Enter the parental PIN to make changes." onSubmit={unlock} />
      </div>
    )
  }

  return (
    <div className="settings-layout">
      <nav className="settings-index" aria-label="Settings sections">
        <h1 className="page-title">Settings</h1>
        {isAdmin && (
          <div className="segmented settings-tabs" role="tablist" aria-label="Settings or admin">
            {(['household', 'admin'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                className={`segmented__item${view === v ? ' segmented__item--active' : ''}`}
                onClick={() => {
                  setView(v)
                  document.querySelector('.app')?.scrollTo({ top: 0 })
                }}
              >
                {v === 'household' ? 'Household' : 'Admin'}
              </button>
            ))}
          </div>
        )}
        <div className="settings-search">
          <SearchIcon size={18} aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search settings" maxLength={60} />
          {query && (
            <button type="button" className="icon-button settings-search__clear" aria-label="Clear search" onClick={() => setQuery('')}>
              <CloseIcon size={18} />
            </button>
          )}
        </div>
        <ol ref={indexRef}>
          {sections.map((s) => (
            <li key={s.id} data-id={s.id}>
              <a
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {admin ? (
        <div className="settings-page" ref={pageRef}>
          <p className="settings-empty muted" hidden>
            No settings match “{query.trim()}”.
          </p>
          <AdminPage userId={userId} familyId={family.id} api={adminApiOverride} />
        </div>
      ) : (
      <div className="settings-page" ref={pageRef}>
        <p className="settings-empty muted" hidden>
          No settings match “{query.trim()}”.
        </p>
        <section className="settings-section" aria-label="Family" id="family">
          <h2>Family</h2>
          <FamilyPage family={family} members={members} userId={userId} />
        </section>
        <AppearanceSettings />
        <DeviceSettings />
        <HomeScreenSettings />
        <CountdownSettings familyId={family.id} userId={userId} />
        <PeopleViewSettings members={members} userId={userId} />
        <GeneralSettings />
        <GoogleCalendarSettings familyId={family.id} me={members.find((m) => m.id === userId)} members={members} />
        <CalendarLinks familyId={family.id} userId={userId} members={members} />
        <CalendarSettings familyName={family.name} />
        <ReminderSettings />
        <EmailReminderSettings familyId={family.id} userId={userId} email={members.find((m) => m.id === userId)?.email ?? ''} timezone={family.timezone} />
        <CookbookSettings
          familyId={family.id}
          userId={userId}
          onReview={() => {
            requestRecipesFilter('review')
            onOpenRecipes?.()
          }}
        />
        <KitchenSettings familyId={family.id} />
        <ScreensaverSettings />
        <SleepSettings />
        <LockSettings save={(c) => saveLock(family.id, c)} />
        <AboutSettings onShowTour={onShowTour} familyId={family.id} householdName={family.name} />
      </div>
      )}
    </div>
  )
}
