import type { Family, Member } from '../../types'
import { FamilyPage } from '../family/FamilyPage'
import { CalendarSettings } from './CalendarSettings'

interface Props {
  family: Family
  members: Member[]
  userId: string
}

export function SettingsPage({ family, members, userId }: Props) {
  return (
    <div className="settings-page">
      <CalendarSettings familyName={family.name} />
      <section className="settings-section" aria-label="Family">
        <h2>Family</h2>
        <FamilyPage family={family} members={members} userId={userId} />
      </section>
    </div>
  )
}
