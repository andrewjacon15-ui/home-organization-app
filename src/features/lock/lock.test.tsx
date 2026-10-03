import { render, screen } from '@testing-library/react'
import { choose } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LockSettings } from '../settings/LockSettings'
import { StaticSettings } from '../settings/SettingsContext'
import { hashPin, isValidPin, shouldLock, verifyPin, type LockConfig } from './lockApi'
import { StaticLock } from './LockContext'
import { PinPad } from './PinPad'

const MIN = 60_000

describe('PIN hashing', () => {
  it('is salted, 64 hex characters, and verifiable', async () => {
    const h = await hashPin('1234', 'salt-a')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashPin('1234', 'salt-a')).toBe(h)
    expect(await hashPin('1234', 'salt-b')).not.toBe(h)
    const config: LockConfig = { enabled: true, lockAfterMinutes: 5, salt: 'salt-a', pinHash: h }
    expect(await verifyPin('1234', config)).toBe(true)
    expect(await verifyPin('4321', config)).toBe(false)
    expect(await verifyPin('1234', { enabled: true, lockAfterMinutes: 5 })).toBe(false)
  })

  it('only accepts four digits', () => {
    expect(isValidPin('0420')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
  })
})

describe('shouldLock', () => {
  const on: LockConfig = { enabled: true, lockAfterMinutes: 5, pinHash: 'x'.repeat(64), salt: 's' }

  it('never locks when off or without a PIN', () => {
    expect(shouldLock({ enabled: false, lockAfterMinutes: 5 }, null, 0, 10 * MIN)).toBe(false)
    expect(shouldLock({ enabled: true, lockAfterMinutes: 5 }, null, 0, 10 * MIN)).toBe(false)
  })

  it('starts locked, and relocks after the idle limit', () => {
    expect(shouldLock(on, null, 0, 0)).toBe(true)
    expect(shouldLock(on, 0, 0, 4 * MIN)).toBe(false)
    expect(shouldLock(on, 0, 0, 5 * MIN)).toBe(true)
    expect(shouldLock(on, 0, 3 * MIN, 7 * MIN)).toBe(false) // activity resets the clock
  })
})

describe('PinPad', () => {
  it('submits on the fourth digit and clears on a wrong PIN', async () => {
    const onSubmit = vi.fn(async (pin: string) => pin === '2468')
    const user = userEvent.setup()
    render(<PinPad title="Settings are locked" onSubmit={onSubmit} />)
    for (const d of ['1', '1', '1', '1']) await user.click(screen.getByRole('button', { name: d }))
    expect(onSubmit).toHaveBeenLastCalledWith('1111')
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN')
    expect(screen.getByLabelText('0 of 4 digits entered')).toBeInTheDocument()
    for (const d of ['2', '4', '6', '9']) await user.click(screen.getByRole('button', { name: d }))
    await user.click(screen.getByRole('button', { name: 'Delete digit' }))
    expect(onSubmit).toHaveBeenCalledTimes(2) // '2469' submitted before delete
  })

  it('supports deleting before the fourth digit', async () => {
    const onSubmit = vi.fn(async () => true)
    const user = userEvent.setup()
    render(<PinPad title="PIN" onSubmit={onSubmit} />)
    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: 'Delete digit' }))
    expect(screen.getByLabelText('1 of 4 digits entered')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('LockSettings', () => {
  async function typePin(user: ReturnType<typeof userEvent.setup>, pin: string) {
    for (const d of pin) await user.click(screen.getByRole('button', { name: d }))
  }

  it('turns the lock on with a confirmed PIN and keeps this device unlocked', async () => {
    const save = vi.fn()
    const markUnlocked = vi.fn()
    const user = userEvent.setup()
    render(
      <StaticSettings>
        <StaticLock value={{ markUnlocked }}>
          <LockSettings save={save} />
        </StaticLock>
      </StaticSettings>,
    )
    await user.click(screen.getByRole('switch', { name: /Turn parental lock on/ }))
    await typePin(user, '2468')
    expect(screen.getByRole('group', { name: 'Enter it again' })).toBeInTheDocument()
    await typePin(user, '2468')
    expect(markUnlocked).toHaveBeenCalled()
    const saved = save.mock.calls[0][0] as LockConfig
    expect(saved).toMatchObject({ enabled: true, lockAfterMinutes: 5 })
    expect(await verifyPin('2468', saved)).toBe(true)
    expect(await screen.findByRole('status')).toHaveTextContent('PIN saved')
  })

  it('starts over when the PINs differ', async () => {
    const save = vi.fn()
    const user = userEvent.setup()
    render(
      <StaticSettings>
        <StaticLock value={{}}>
          <LockSettings save={save} />
        </StaticLock>
      </StaticSettings>,
    )
    await user.click(screen.getByRole('switch', { name: /Turn parental lock on/ }))
    await typePin(user, '1111')
    await typePin(user, '2222')
    expect(save).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent("didn't match")
  })

  it('offers lock-after, change PIN, and lock now once on', async () => {
    const save = vi.fn()
    const lockNow = vi.fn()
    const user = userEvent.setup()
    const config: LockConfig = { enabled: true, lockAfterMinutes: 5, salt: 's', pinHash: 'a'.repeat(64) }
    render(
      <StaticSettings>
        <StaticLock value={{ config, lockNow }}>
          <LockSettings save={save} />
        </StaticLock>
      </StaticSettings>,
    )
    await choose(user, screen.getByLabelText('Lock after'), '15 minutes')
    expect(save).toHaveBeenLastCalledWith({ ...config, lockAfterMinutes: 15 })
    await user.click(screen.getByRole('button', { name: 'Lock now' }))
    expect(lockNow).toHaveBeenCalled()
    await user.click(screen.getByRole('switch', { name: /Turn parental lock on/ }))
    expect(save).toHaveBeenLastCalledWith({ enabled: false, lockAfterMinutes: 5 })
  })
})
