import { useState, type CSSProperties, type FormEvent } from 'react'
import { Select } from '../../components/Select'
import type { Member } from '../../types'
import type { NewReward, Reward } from './rewardsApi'

const EMOJIS = ['🎁', '🍦', '🎮', '🎬', '📚', '🧸', '🍕', '🏖️', '💵', '⭐']

interface Props {
  members: Member[]
  rewards: Reward[]
  balances: Map<string, number>
  onAdd: (reward: NewReward) => void
  onRedeem: (reward: Reward, memberId: string) => void
  onDelete: (reward: Reward) => void
}

export function RewardsBoard({ members, rewards, balances, onAdd, onRedeem, onDelete }: Props) {
  const open = rewards.filter((r) => !r.redeemedAt).sort((a, b) => a.cost - b.cost)
  const claimed = rewards.filter((r) => r.redeemedAt).sort((a, b) => b.redeemedAt!.getTime() - a.redeemedAt!.getTime())
  const byId = new Map(members.map((m) => [m.id, m]))

  return (
    <section className="rewards" aria-label="Rewards">
      <AddRewardForm members={members} onAdd={onAdd} />

      <div className="reward-columns">
        {members.map((m) => {
          const balance = balances.get(m.id) ?? 0
          const mine = open.filter((r) => r.memberId === m.id || r.memberId === null)
          return (
            <article key={m.id} className="reward-card card" style={{ '--pill': m.color } as CSSProperties} aria-label={m.displayName}>
              <header className="reward-card__head">
                <span className="avatar" aria-hidden>{m.displayName.charAt(0)}</span>
                <span className="reward-card__name">{m.displayName.split(' ')[0]}</span>
                <span className="reward-card__balance" aria-label={`${balance} stars`}>★ {balance}</span>
              </header>
              {mine.length === 0 ? (
                <p className="muted">No rewards yet.</p>
              ) : (
                <ul className="reward-list">
                  {mine.map((r) => {
                    const pct = Math.min(100, Math.round((Math.max(balance, 0) / r.cost) * 100))
                    const ready = balance >= r.cost
                    return (
                      <li key={r.id} className={`reward${ready ? ' reward--ready' : ''}`}>
                        <span className="reward__emoji" aria-hidden>{r.emoji ?? '🎁'}</span>
                        <div className="reward__body">
                          <span className="reward__title">
                            {r.title}
                            {r.memberId === null && <span className="muted"> · anyone</span>}
                          </span>
                          <div className="progress" role="progressbar" aria-label={`${r.title} progress for ${m.displayName}`} aria-valuemin={0} aria-valuemax={r.cost} aria-valuenow={Math.min(Math.max(balance, 0), r.cost)}>
                            <div className="progress__fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="reward__cost">
                            {Math.min(Math.max(balance, 0), r.cost)} / {r.cost} ★
                          </span>
                        </div>
                        {ready ? (
                          <button
                            type="button"
                            className="button button--primary"
                            onClick={() => {
                              if (confirm(`Redeem "${r.title}" for ${m.displayName.split(' ')[0]}? This spends ${r.cost} stars.`)) onRedeem(r, m.id)
                            }}
                          >
                            Redeem
                          </button>
                        ) : (
                          <button type="button" className="icon-button" onClick={() => onDelete(r)} aria-label={`Delete reward "${r.title}"`}>
                            ✕
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </article>
          )
        })}
      </div>

      {claimed.length > 0 && (
        <details className="done-section">
          <summary>Claimed ({claimed.length})</summary>
          <ul className="claimed-list">
            {claimed.map((r) => (
              <li key={r.id}>
                {r.emoji ?? '🎁'} {r.title} · {byId.get(r.redeemedBy ?? '')?.displayName.split(' ')[0] ?? 'someone'} ·{' '}
                {r.redeemedAt!.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                <button type="button" className="link" onClick={() => onDelete(r)} aria-label={`Remove claimed reward "${r.title}"`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function AddRewardForm({ members, onAdd }: { members: Member[]; onAdd: (r: NewReward) => void }) {
  const [title, setTitle] = useState('')
  const [cost, setCost] = useState(10)
  const [memberId, setMemberId] = useState('')
  const [emoji, setEmoji] = useState('🎁')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || cost < 1) return
    onAdd({ title: title.trim(), cost: Math.floor(cost), memberId: memberId || null, emoji })
    setTitle('')
  }

  return (
    <form className="card reward-form" onSubmit={submit} aria-label="New reward">
      <Select value={emoji} onChange={setEmoji} aria-label="Icon" options={EMOJIS.map((x) => ({ value: x, label: x }))} />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a reward…" aria-label="Reward" maxLength={100} />
      <input type="number" min={1} max={100000} value={cost} onChange={(e) => setCost(Number(e.target.value))} aria-label="Stars needed" />
      <Select value={memberId} onChange={setMemberId} aria-label="For" options={[{ value: '', label: 'Anyone' }, ...members.map((m) => ({ value: m.id, label: m.displayName }))]} />
      <button className="button button--primary" disabled={!title.trim()}>
        Add
      </button>
    </form>
  )
}
