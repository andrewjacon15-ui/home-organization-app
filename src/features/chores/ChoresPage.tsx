import { useEffect, useState } from 'react'
import { useToday } from '../../lib/hooks'
import type { Chore, Member } from '../../types'
import { addChore, deleteChore, setChoreDone, watchChores } from './choresApi'
import { ChoreList } from './ChoreList'

interface Props {
  familyId: string
  userId: string
  members: Member[]
}

export function ChoresPage({ familyId, userId, members }: Props) {
  const [chores, setChores] = useState<Chore[]>([])
  const [error, setError] = useState<string | null>(null)
  const today = useToday()

  useEffect(() => watchChores(familyId, setChores), [familyId])

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
        onToggle={(c) => setChoreDone(familyId, c.id, !c.done).catch(report)}
        onDelete={(c) => deleteChore(familyId, c.id).catch(report)}
      />
    </>
  )
}
