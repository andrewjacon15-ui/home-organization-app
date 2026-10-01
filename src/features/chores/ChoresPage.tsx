import { useEffect, useState } from 'react'
import { PeopleFilter } from '../../components/PeopleFilter'
import { useNow, useToday } from '../../lib/hooks'
import { personFor, readPeopleDefault } from '../../lib/peopleView'
import type { Chore, Member } from '../../types'
import { backfillChoreStars, balances, watchStars, type StarEntry } from '../rewards/rewardsApi'
import { useSettings } from '../settings/SettingsContext'
import { ChoreBoard } from './ChoreBoard'
import { addChore, deleteChore, setOccurrenceDone, watchChores } from './choresApi'

interface Props {
  familyId: string
  userId: string
  members: Member[]
}

export function ChoresPage({ familyId, userId, members }: Props) {
  const [chores, setChores] = useState<Chore[]>([])
  const [entries, setEntries] = useState<StarEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = useToday()
  const now = useNow()
  const { settings } = useSettings()
  const [view, setView] = useState(() => readPeopleDefault('chores'))
  const only = personFor(view, userId, members.map((m) => m.id))

  useEffect(() => watchChores(familyId, setChores), [familyId])
  useEffect(() => watchStars(familyId, setEntries), [familyId])

  // One-time catch-up for one-off chores completed before stars had a ledger.
  useEffect(() => {
    if (entries) void backfillChoreStars(familyId, chores.filter((c) => !c.repeat), entries, userId)
  }, [familyId, chores, entries, userId])

  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <PeopleFilter members={members} userId={userId} value={view} onChange={setView} label="Show chores for" />
      <ChoreBoard
        only={only}
        chores={chores}
        members={members}
        stars={entries ? balances(entries) : new Map()}
        today={today}
        now={now}
        weekStartsOn={settings.weekStartsOn}
        onToggle={(o, done, doneBy) => setOccurrenceDone(familyId, o, done, doneBy, userId, today).catch(report)}
        onAdd={(c) => addChore(familyId, userId, c).catch(report)}
        onDelete={(c) => deleteChore(familyId, c.id).catch(report)}
      />
    </>
  )
}
