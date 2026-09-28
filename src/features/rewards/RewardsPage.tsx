import { useEffect, useState } from 'react'
import type { Member } from '../../types'
import { addReward, balances, deleteReward, redeemReward, watchRewards, watchStars, type Reward, type StarEntry } from './rewardsApi'
import { RewardsBoard } from './RewardsBoard'

export function RewardsPage({ familyId, userId, members }: { familyId: string; userId: string; members: Member[] }) {
  const [rewards, setRewards] = useState<Reward[]>([])
  const [entries, setEntries] = useState<StarEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => watchRewards(familyId, setRewards), [familyId])
  useEffect(() => watchStars(familyId, setEntries), [familyId])

  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <RewardsBoard
        members={members}
        rewards={rewards}
        balances={balances(entries)}
        onAdd={(r) => addReward(familyId, userId, r).catch(report)}
        onRedeem={(r, memberId) => redeemReward(familyId, r, memberId, userId).catch(report)}
        onDelete={(r) => deleteReward(familyId, r.id).catch(report)}
      />
    </>
  )
}
