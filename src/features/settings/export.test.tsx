import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import { exportFileName, plain, type HouseholdExport } from './exportData'
import { ExportRow } from './ExportRow'

describe('household export', () => {
  it('turns Firestore values into plain JSON', () => {
    const at = Timestamp.fromDate(new Date('2026-10-03T12:00:00Z'))
    expect(plain({ title: 'Soccer', start: at, tags: [at, 'x'], nested: { done: true } })).toEqual({
      title: 'Soccer',
      start: '2026-10-03T12:00:00.000Z',
      tags: ['2026-10-03T12:00:00.000Z', 'x'],
      nested: { done: true },
    })
    expect(exportFileName('The Rivera Family!', '2026-10-03')).toBe('the-rivera-family-2026-10-03.json')
    expect(exportFileName('', '2026-10-03')).toBe('household-2026-10-03.json')
  })

  it('downloads a copy from Settings and says what it saved', async () => {
    const user = userEvent.setup()
    const data: HouseholdExport = { format: 'family-organizer-export', version: 1, exportedAt: '', household: {}, lists: [], skipped: ['reminderPrefs'] }
    const run = vi.fn(async () => data)
    const save = vi.fn()
    render(<ExportRow familyId="f1" name="The Rivera Family" run={run} save={save} />)
    await user.click(screen.getByRole('button', { name: 'Download a copy' }))
    expect(run).toHaveBeenCalledWith('f1')
    expect(save).toHaveBeenCalledWith(data, expect.stringMatching(/^the-rivera-family-\d{4}-\d{2}-\d{2}\.json$/))
    expect(screen.getByRole('status')).toHaveTextContent(/Saved the-rivera-family-.*\.json\. Left out what only its owner can see \(reminderPrefs\)/)
  })
})
