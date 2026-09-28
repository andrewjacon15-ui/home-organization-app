import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { defaultPrefs, type ReminderPrefs } from '../reminders/reminderPrefsApi'
import { EmailReminderRows } from './EmailReminderSettings'

function Harness({ onSave, timezone = 'America/Chicago' }: { onSave: (p: ReminderPrefs) => void; timezone?: string }) {
  const [prefs, setPrefs] = useState(defaultPrefs('America/New_York'))
  return (
    <EmailReminderRows
      email="me@example.test"
      timezone={timezone}
      prefs={prefs}
      onChange={(p) => {
        setPrefs(p)
        onSave(p)
      }}
    />
  )
}

describe('EmailReminderRows', () => {
  it('starts off, shows where emails go, and reveals options when turned on', () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    expect(screen.getByText('me@example.test')).toBeInTheDocument()
    expect(screen.queryByLabelText('How long before')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Email me before my events' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ eventEmailsEnabled: true, leadTimeMinutes: 30, timezone: 'America/Chicago' }))

    fireEvent.change(screen.getByLabelText('How long before'), { target: { value: '60' } })
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ leadTimeMinutes: 60 }))
  })

  it('schedules the daily digest at a chosen hour', () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    fireEvent.click(screen.getByRole('switch', { name: /daily digest/i }))
    const hour = screen.getByLabelText('Send at') as HTMLSelectElement
    expect(hour.value).toBe('7')
    fireEvent.change(hour, { target: { value: '6' } })
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ dailyDigestEnabled: true, digestHourLocal: 6 }))
  })
})
