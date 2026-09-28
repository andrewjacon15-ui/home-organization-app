import type { Family, Member } from '../../types'
import { FamilyPage } from '../family/FamilyPage'
import { saveLock } from '../lock/lockApi'
import { useLock } from '../lock/LockContext'
import { PinPad } from '../lock/PinPad'
import { AboutSettings } from './AboutSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { CalendarSettings } from './CalendarSettings'
import { GeneralSettings } from './GeneralSettings'
import { GoogleCalendarSettings } from './GoogleCalendarSettings'
import { LockSettings } from './LockSettings'
import { ReminderSettings } from './ReminderSettings'

interface Props {
  family: Family
  members: Member[]
  userId: string
}

const SECTIONS = [
  { id: 'family', label: 'Family' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'general', label: 'General' },
  { id: 'display', label: 'Display' },
  { id: 'google', label: 'Google Calendar' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'lock', label: 'Parental lock' },
  { id: 'about', label: 'About' },
]

export function SettingsPage({ family, members, userId }: Props) {
  const { locked, unlock } = useLock()

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
        <ol>
          {SECTIONS.map((s) => (
            <li key={s.id}>
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
      <div className="settings-page">
        <section className="settings-section" aria-label="Family" id="family">
          <h2>Family</h2>
          <FamilyPage family={family} members={members} userId={userId} />
        </section>
        <AppearanceSettings />
        <GeneralSettings />
        <GoogleCalendarSettings familyId={family.id} me={members.find((m) => m.id === userId)} members={members} />
        <CalendarSettings familyName={family.name} />
        <ReminderSettings />
        <LockSettings save={(c) => saveLock(family.id, c)} />
        <AboutSettings />
      </div>
    </div>
  )
}
