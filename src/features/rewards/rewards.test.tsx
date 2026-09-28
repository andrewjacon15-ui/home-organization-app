import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '../../types'
import { balances, type Reward } from './rewardsApi'
import { RewardsBoard } from './RewardsBoard'

const members: Member[] = [
  { id: 'a', displayName: 'Andrew', email: 'a@x.com', color: '#e76f51' },
  { id: 'l', displayName: 'Lydia', email: 'l@x.com', color: '#2a9d8f' },
]

const rewards: Reward[] = [
  { id: 'r1', title: 'Ice cream', cost: 10, memberId: 'l', emoji: '🍦' },
  { id: 'r2', title: 'Movie night', cost: 30, memberId: null, emoji: '🎬' },
  { id: 'r3', title: 'Video games', cost: 5, memberId: 'a', emoji: '🎮', redeemedAt: new Date(2026, 8, 20), redeemedBy: 'a' },
]

function setup(stars: [string, number][] = [['l', 12], ['a', 4]]) {
  const props = { members, rewards, balances: new Map(stars), onAdd: vi.fn(), onRedeem: vi.fn(), onDelete: vi.fn() }
  render(<RewardsBoard {...props} />)
  return { props, user: userEvent.setup() }
}

afterEach(() => vi.restoreAllMocks())

describe('balances', () => {
  it('sums credits and debits per person', () => {
    const b = balances([
      { id: '1', memberId: 'l', delta: 3, reason: '' },
      { id: '2', memberId: 'l', delta: 5, reason: '' },
      { id: '3', memberId: 'l', delta: -4, reason: '' },
      { id: '4', memberId: 'a', delta: 2, reason: '' },
    ])
    expect(b.get('l')).toBe(4)
    expect(b.get('a')).toBe(2)
  })
})

describe('RewardsBoard', () => {
  it('shows each person’s balance with their own and shared rewards', () => {
    setup()
    const lydia = screen.getByRole('article', { name: 'Lydia' })
    expect(within(lydia).getByLabelText('12 stars')).toBeInTheDocument()
    expect(within(lydia).getByText('Ice cream')).toBeInTheDocument()
    expect(within(lydia).getByText('Movie night')).toBeInTheDocument()
    const andrew = screen.getByRole('article', { name: 'Andrew' })
    expect(within(andrew).queryByText('Ice cream')).not.toBeInTheDocument()
    expect(within(andrew).getByText('Movie night')).toBeInTheDocument()
  })

  it('shows progress and only offers Redeem when affordable', async () => {
    const { props, user } = setup()
    const lydia = screen.getByRole('article', { name: 'Lydia' })
    expect(within(lydia).getByRole('progressbar', { name: /Ice cream/ })).toHaveAttribute('aria-valuenow', '10')
    expect(within(lydia).getByRole('progressbar', { name: /Movie night/ })).toHaveAttribute('aria-valuenow', '12')
    expect(within(lydia).getByText('12 / 30 ★')).toBeInTheDocument()
    expect(within(lydia).getAllByRole('button', { name: 'Redeem' })).toHaveLength(1)

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(within(lydia).getByRole('button', { name: 'Redeem' }))
    expect(props.onRedeem).toHaveBeenCalledWith(rewards[0], 'l')
  })

  it('does nothing if the redeem is cancelled', async () => {
    const { props, user } = setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(within(screen.getByRole('article', { name: 'Lydia' })).getByRole('button', { name: 'Redeem' }))
    expect(props.onRedeem).not.toHaveBeenCalled()
  })

  it('lists claimed rewards separately', () => {
    setup()
    expect(screen.getByText('Claimed (1)')).toBeInTheDocument()
    expect(screen.getByText(/Video games · Andrew/)).toBeInTheDocument()
  })

  it('adds a reward for one person or anyone', async () => {
    const { props, user } = setup()
    await user.type(screen.getByLabelText('Reward'), 'Pizza night')
    await user.clear(screen.getByLabelText('Stars needed'))
    await user.type(screen.getByLabelText('Stars needed'), '25')
    await user.selectOptions(screen.getByLabelText('For'), 'Lydia')
    await user.selectOptions(screen.getByLabelText('Icon'), '🍕')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(props.onAdd).toHaveBeenCalledWith({ title: 'Pizza night', cost: 25, memberId: 'l', emoji: '🍕' })
  })
})
