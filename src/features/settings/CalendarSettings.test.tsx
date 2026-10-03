import { render, screen } from '@testing-library/react'
import { choose } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CalendarSettings } from './CalendarSettings'
import { StaticSettings } from './SettingsContext'

function setup(settings = {}) {
  const update = vi.fn(async () => undefined)
  render(
    <StaticSettings settings={settings} update={update}>
      <CalendarSettings familyName="The Tester Family" />
    </StaticSettings>,
  )
  return { update, user: userEvent.setup() }
}

describe('CalendarSettings', () => {
  it('shows the Skylight defaults', () => {
    setup()
    expect(screen.getByLabelText('Start week on')).toHaveTextContent('Sunday')
    expect(screen.getByLabelText('Show countdowns')).toHaveTextContent('Always')
    expect(screen.getByRole('switch', { name: 'Color code multi-profile events' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Shade weekends' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Dim past events' })).toBeChecked()
    expect(screen.getByLabelText('Days displayed')).toHaveTextContent('7')
    expect(screen.getByLabelText('Calendar display name')).toHaveAttribute('placeholder', 'The Tester Family')
  })

  it('saves each change', async () => {
    const { update, user } = setup()
    await user.click(screen.getByRole('switch', { name: 'Shade weekends' }))
    expect(update).toHaveBeenLastCalledWith({ shadeWeekends: true })
    await choose(user, screen.getByLabelText('Start week on'), 'Monday')
    expect(update).toHaveBeenLastCalledWith({ weekStartsOn: 1 })
    await choose(user, screen.getByLabelText('Days displayed'), '3')
    expect(update).toHaveBeenLastCalledWith({ scheduleDays: 3 })
    await user.type(screen.getByLabelText('Calendar display name'), 'Jacon Calendar{Enter}')
    expect(update).toHaveBeenLastCalledWith({ calendarName: 'Jacon Calendar' })
  })

  it('switches toggle off', async () => {
    const { update, user } = setup({ dimPastEvents: true })
    await user.click(screen.getByRole('switch', { name: 'Dim past events' }))
    expect(update).toHaveBeenLastCalledWith({ dimPastEvents: false })
  })
})
