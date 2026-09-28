import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase'
import type { Chore } from '../../types'

export interface StarEntry {
  id: string
  memberId: string
  delta: number
  reason: string
  choreId?: string | null
  rewardId?: string | null
}

export interface Reward {
  id: string
  title: string
  cost: number
  /** null = anyone can claim it */
  memberId: string | null
  emoji?: string
  redeemedAt?: Date
  redeemedBy?: string
}

export type NewReward = Pick<Reward, 'title' | 'cost' | 'memberId' | 'emoji'>

const starsCol = (familyId: string) => collection(db, 'families', familyId, 'stars')
const rewardsCol = (familyId: string) => collection(db, 'families', familyId, 'rewards')
const choreEntryId = (choreId: string) => `chore_${choreId}`

export function balances(entries: StarEntry[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of entries) out.set(e.memberId, (out.get(e.memberId) ?? 0) + e.delta)
  return out
}

export function watchStars(familyId: string, onChange: (entries: StarEntry[]) => void) {
  return onSnapshot(starsCol(familyId), (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StarEntry)))
}

export function watchRewards(familyId: string, onChange: (rewards: Reward[]) => void) {
  return onSnapshot(rewardsCol(familyId), (snap) =>
    onChange(
      snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          title: data.title,
          cost: data.cost,
          memberId: data.memberId ?? null,
          ...(data.emoji ? { emoji: data.emoji } : {}),
          ...(data.redeemedAt ? { redeemedAt: (data.redeemedAt as Timestamp).toDate(), redeemedBy: data.redeemedBy } : {}),
        }
      }),
    ),
  )
}


/** Chores finished before the ledger existed: credit them once (the fixed entry ID makes this idempotent). */
export async function backfillChoreStars(familyId: string, chores: Chore[], entries: StarEntry[], userId: string) {
  const have = new Set(entries.map((e) => e.id))
  const missing = chores.filter((c) => c.done && c.assigneeId && c.points > 0 && !have.has(choreEntryId(c.id)))
  if (missing.length === 0) return
  const batch = writeBatch(db)
  for (const c of missing) {
    batch.set(doc(starsCol(familyId), choreEntryId(c.id)), { memberId: c.assigneeId, delta: c.points, reason: `Chore: ${c.title}`.slice(0, 200), choreId: c.id, createdBy: userId, createdAt: serverTimestamp() })
  }
  await batch.commit().catch(() => undefined) // another device got there first
}

export function addReward(familyId: string, userId: string, reward: NewReward) {
  return addDoc(rewardsCol(familyId), { ...reward, ...(reward.emoji ? {} : { emoji: '🎁' }), createdBy: userId, createdAt: serverTimestamp() })
}

export function deleteReward(familyId: string, rewardId: string) {
  return deleteDoc(doc(rewardsCol(familyId), rewardId))
}

/** Spends the member's stars and marks the reward claimed, atomically. */
export async function redeemReward(familyId: string, reward: Reward, memberId: string, userId: string) {
  const batch = writeBatch(db)
  batch.set(doc(starsCol(familyId)), { memberId, delta: -reward.cost, reason: `Reward: ${reward.title}`.slice(0, 200), rewardId: reward.id, createdBy: userId, createdAt: serverTimestamp() })
  batch.update(doc(rewardsCol(familyId), reward.id), { redeemedBy: memberId, redeemedAt: serverTimestamp() })
  await batch.commit()
}
