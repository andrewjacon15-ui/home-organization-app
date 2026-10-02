import { useState } from 'react'
import { decodeView, encodeView, readPeopleDefault, savePeopleDefault, type PeoplePage } from '../../lib/peopleView'
import type { Member } from '../../types'
import { SelectRow, SettingsSection } from './SettingRows'
import { useSettings } from './SettingsContext'

/** What Lists and Chores open on, on this device. The page's own filter can still switch any time. */
export function PeopleViewSettings({ members, userId }: { members: Member[]; userId: string }) {
  const [lists, setLists] = useState(() => encodeView(readPeopleDefault('lists')))
  const [chores, setChores] = useState(() => encodeView(readPeopleDefault('chores')))
  const { settings, update } = useSettings()

  const options = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'me', label: 'Just me' },
    ...members.filter((m) => m.id !== userId).map((m) => ({ value: encodeView({ member: m.id }), label: `${m.displayName.split(' ')[0]} only` })),
  ]
  const save = (page: PeoplePage, set: (v: string) => void) => (value: string) => {
    set(value)
    savePeopleDefault(page, decodeView(value))
  }

  return (
    <SettingsSection title="Lists & chores" id="people">
      <p className="settings-note">Whose items Lists and Chores show when you open them. Saved on this device, so your phone can show just yours while the wall shows everyone's.</p>
      <SelectRow label="Lists show" value={lists} options={options} onChange={save('lists', setLists)} />
      <SelectRow label="Chores show" value={chores} options={options} onChange={save('chores', setChores)} />
      <SelectRow
        label="Remove checked-off list items after"
        value={settings.listDoneDays}
        options={[
          { value: 7, label: '1 week' },
          { value: 30, label: '30 days' },
          { value: 90, label: '90 days' },
          { value: 0, label: 'Never (clear by hand)' },
        ]}
        onChange={(listDoneDays) => void update({ listDoneDays })}
      />
      <p className="settings-note">For the whole family. Items you haven't checked off are never removed.</p>
    </SettingsSection>
  )
}
