import type { Family, Member } from '../../types'
import { FamilyPage } from '../family/FamilyPage'
import { AboutSettings } from './AboutSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { CalendarSettings } from './CalendarSettings'
import { GeneralSettings } from './GeneralSettings'
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
  { id: 'calendar', label: 'Calendar' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'about', label: 'About' },
]

export function SettingsPage({ family, members, userId }: Props) {
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
        <CalendarSettings familyName={family.name} />
        <ReminderSettings />
        <AboutSettings />
      </div>
    </div>
  )
}
