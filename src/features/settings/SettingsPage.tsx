import type { Family, Member } from '../../types'
import { FamilyPage } from '../family/FamilyPage'
import { CalendarSettings } from './CalendarSettings'
import { GeneralSettings } from './GeneralSettings'
import { ReminderSettings } from './ReminderSettings'

interface Props {
  family: Family
  members: Member[]
  userId: string
}

export function SettingsPage({ family, members, userId }: Props) {
  return (
    <div className="settings-page">
      <GeneralSettings />
      <CalendarSettings familyName={family.name} />
      <ReminderSettings />
      <section className="settings-section" aria-label="Family">
        <h2>Family</h2>
        <FamilyPage family={family} members={members} userId={userId} />
      </section>
    </div>
  )
}
