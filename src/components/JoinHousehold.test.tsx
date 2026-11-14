import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { describe, expect, it, vi } from 'vitest'
import { JoinHousehold } from './JoinHousehold'

vi.mock('../firebase', () => ({ auth: {}, db: {} }))

const user = { uid: 'carol', email: 'carol@example.com', displayName: 'Carol' } as User

describe('JoinHousehold', () => {
  it('says who invited you to what, and joins only when you say so', async () => {
    const join = vi.fn(async () => 'fam')
    const decline = vi.fn(async () => undefined)
    const onJoined = vi.fn()
    render(<JoinHousehold user={user} invite={{ familyId: 'fam', familyName: 'The Parkers', inviterName: 'Sam' }} onJoined={onJoined} onDeclined={vi.fn()} api={{ join, decline }} />)

    expect(screen.getByRole('heading', { name: 'Join this household?' })).toBeInTheDocument()
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.getByText('The Parkers')).toBeInTheDocument()
    expect(join).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith('fam'))
    expect(decline).not.toHaveBeenCalled()
  })

  it('turns the invitation down, and copes with an invite that has no names', async () => {
    const join = vi.fn(async () => 'fam')
    const decline = vi.fn(async () => undefined)
    const onDeclined = vi.fn()
    render(<JoinHousehold user={user} invite={{ familyId: 'fam' }} onJoined={vi.fn()} onDeclined={onDeclined} api={{ join, decline }} />)

    expect(screen.getByText(/Someone invited/)).toHaveTextContent('Someone invited carol@example.com to join a household.')
    await userEvent.click(screen.getByRole('button', { name: 'No thanks' }))
    await waitFor(() => expect(onDeclined).toHaveBeenCalled())
    expect(decline).toHaveBeenCalledWith(user)
    expect(join).not.toHaveBeenCalled()
  })

  it('shows what went wrong and lets you try again', async () => {
    const join = vi.fn(async () => Promise.reject(new Error('Missing or insufficient permissions.')))
    render(<JoinHousehold user={user} invite={{ familyId: 'fam' }} onJoined={vi.fn()} onDeclined={vi.fn()} api={{ join, decline: vi.fn() }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('insufficient permissions')
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled()
  })
})
