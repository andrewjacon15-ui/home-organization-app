import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UndoProvider } from '../../components/UndoToast'
import type { Countdown, GoogleSpecial } from '../countdowns/countdownsApi'
import { CountdownSettings } from './CountdownSettings'
import { StaticSettings } from './SettingsContext'
import type { DisplaySettings } from './settingsApi'

function setup(settings: Partial<DisplaySettings> = {}) {
  let push: (list: Countdown[]) => void = () => undefined
  const restore = vi.fn(async () => undefined)
  const api = {
    watch: vi.fn((_f: string, cb: (l: Countdown[]) => void) => {
      push = cb
      cb([
        { id: 'trip', title: 'Beach trip', date: '2099-06-01', kind: 'once' },
        { id: 'mom', title: 'Mom', date: '1966-11-02', kind: 'birthday' },
      ])
      return () => undefined
    }),
    watchGoogle: vi.fn((_f: string, cb: (l: GoogleSpecial[]) => void) => {
      cb([{ id: 'g', title: 'Jake’s birthday', date: '2099-01-05', kind: 'birthday' }])
      return () => undefined
    }),
    add: vi.fn(async () => undefined as never),
    remove: vi.fn(async () => restore),
  }
  const update = vi.fn(async () => undefined)
  render(
    <UndoProvider>
      <StaticSettings settings={{ countdownGoogle: true, countdownHolidays: true, ...settings }} update={update}>
        <CountdownSettings familyId="f" userId="u" api={api} />
      </StaticSettings>
    </UndoProvider>,
  )
  return { api, update, restore, push: (l: Countdown[]) => act(() => push(l)) }
}

describe('Settings → Countdowns', () => {
  it('lists saved countdowns and Google birthdays, adds and removes', async () => {
    const u = userEvent.setup()
    const { api, update } = setup()
    const list = screen.getByRole('list', { name: 'Your countdowns' })
    expect(within(list).getByText('Mom’s birthday')).toBeInTheDocument()
    expect(within(list).getByText('Beach trip')).toBeInTheDocument()
    expect(within(list).getByText(/From Google Calendar/)).toBeInTheDocument()
    // Google ones can't be removed here.
    expect(within(list).getAllByRole('button', { name: /^Remove/ })).toHaveLength(2)

    await u.type(screen.getByLabelText('What are you counting down to?'), 'Disney')
    await u.type(screen.getByLabelText('Date'), '2099-03-01')
    await u.click(screen.getByRole('button', { name: 'Add' }))
    expect(api.add).toHaveBeenCalledWith('f', 'u', 'Disney', '2099-03-01', 'once')

    await u.click(screen.getByRole('button', { name: 'Remove Beach trip' }))
    expect(api.remove).toHaveBeenCalledWith('f', 'trip')
    expect(await screen.findByRole('status')).toHaveTextContent('Removed “Beach trip”')

    await u.click(screen.getByRole('switch', { name: /Birthdays from Google Calendar/ }))
    expect(update).toHaveBeenCalledWith({ countdownGoogle: false })
    await u.click(screen.getByRole('switch', { name: /US holidays/ }))
    expect(update).toHaveBeenCalledWith({ countdownHolidays: false })
  })

  it('reads no Google birthdays when they’re switched off', () => {
    const { api } = setup({ countdownGoogle: false })
    expect(api.watchGoogle).not.toHaveBeenCalled()
    expect(screen.queryByText(/From Google Calendar/)).not.toBeInTheDocument()
  })
})
