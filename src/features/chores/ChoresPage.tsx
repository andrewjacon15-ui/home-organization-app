import { useEffect, useState } from 'react'
import { useToday } from '../../lib/hooks'
import type { Chore, Member } from '../../types'
import { backfillChoreStars, balances, setChoreDoneWithStars, watchStars, type StarEntry } from '../rewards/rewardsApi'
import { addChore, deleteChore, watchChores } from './choresApi'
import { ChoreList } from './ChoreList'

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

  useEffect(() => watchChores(familyId, setChores), [familyId])
  useEffect(() => watchStars(familyId, setEntries), [familyId])

  // One-time catch-up for chores completed before stars had a ledger.
  useEffect(() => {
    if (entries) void backfillChoreStars(familyId, chores, entries, userId)
  }, [familyId, chores, entries, userId])

  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <ChoreList
        chores={chores}
        members={members}
        today={today}
        onAdd={(c) => addChore(familyId, userId, c).catch(report)}
        onToggle={(c) => setChoreDoneWithStars(familyId, c, !c.done, userId).catch(report)}
        stars={entries ? balances(entries) : undefined}
        onDelete={(c) => deleteChore(familyId, c.id).catch(report)}
      />
    </>
  )
}
