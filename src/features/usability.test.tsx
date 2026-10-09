import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { UNDO_MS, UndoProvider } from '../components/UndoToast'
import { useUndo } from '../lib/undo'
import type { Member } from '../types'
import { ChoreForm } from './chores/ChoreForm'
import { needsAisles, type FamilyList } from './lists/listsApi'
import { useSettingsSearch } from './settings/useSettingsSearch'
import { homeStyleFor, textSizeFor } from './settings/settingsApi'

const members = [
  { id: 'sam', displayName: 'Sam Rivera', color: '#15803d' },
  { id: 'lee', displayName: 'Lee Rivera', color: '#c2410c' },
  { id: 'max', displayName: 'Max Rivera', color: '#2563eb' },
] as Member[]

describe('chore rotations in the form', () => {
  it('takes turns between people, in the order tapped', async () => {
    const onAdd = vi.fn()
    const u = userEvent.setup()
    render(<ChoreForm members={members} defaultDate="2026-10-06" onAdd={onAdd} onCancel={vi.fn()} />)
    await u.type(screen.getByLabelText('Chore'), 'Trash out')
    // Only repeating chores can take turns.
    expect(screen.queryByLabelText('Take turns')).not.toBeInTheDocument()
    await u.click(screen.getByRole('combobox', { name: 'Repeat' }))
    await u.click(screen.getByRole('option', { name: 'Every week' }))
    await u.click(screen.getByLabelText('Take turns'))
    expect(screen.getByRole('button', { name: 'Add chore' })).toBeDisabled()
    await u.click(screen.getByRole('button', { name: 'Lee Rivera' }))
    await u.click(screen.getByRole('button', { name: 'Sam Rivera' }))
    expect(screen.getByRole('button', { name: 'Lee Rivera, turn 1' })).toHaveAttribute('aria-pressed', 'true')
    await u.click(screen.getByRole('button', { name: 'Add chore' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Trash out', assigneeId: 'lee', rotation: ['lee', 'sam'], repeat: { freq: 'weekly', interval: 1, days: [2] } }))
  })
})

function Deleter({ restore }: { restore: () => Promise<void> }) {
  const { offer } = useUndo()
  return (
    <button type="button" onClick={() => offer('Deleted “Trash out”', restore)}>
      Delete
    </button>
  )
}

describe('undo instead of "are you sure?"', () => {
  it('offers Undo after a delete, and puts it back', async () => {
    const restore = vi.fn(async () => undefined)
    render(
      <UndoProvider>
        <Deleter restore={restore} />
      </UndoProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('status')).toHaveTextContent('Deleted “Trash out”')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })))
    expect(restore).toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('goes away on its own', () => {
    vi.useFakeTimers()
    try {
      render(
        <UndoProvider>
          <Deleter restore={vi.fn(async () => undefined)} />
        </UndoProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
      act(() => vi.advanceTimersByTime(UNDO_MS + 10))
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

function SearchPage() {
  const [q, setQ] = useState('')
  const page = useRef<HTMLDivElement>(null)
  const index = useRef<HTMLOListElement>(null)
  useSettingsSearch(page, index, q, 'household')
  return (
    <>
      <input aria-label="Search settings" value={q} onChange={(e) => setQ(e.target.value)} />
      <ol ref={index}>
        <li data-id="sleep">Sleep mode</li>
        <li data-id="reminders">Reminders</li>
      </ol>
      <div ref={page}>
        <p className="settings-empty" hidden>
          No settings match
        </p>
        <section className="settings-section" id="sleep" aria-label="Sleep mode">
          Blanks the wall display at night
        </section>
        <section className="settings-section" id="reminders" aria-label="Reminders">
          Quiet hours, reminder sound
        </section>
      </div>
    </>
  )
}

describe('settings search', () => {
  it('shows only the sections (and index entries) that match', async () => {
    const u = userEvent.setup()
    render(<SearchPage />)
    await u.type(screen.getByLabelText('Search settings'), 'quiet')
    expect(screen.getByRole('region', { name: 'Reminders' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Sleep mode' })).not.toBeInTheDocument()
    expect(screen.getByText('Sleep mode', { selector: 'li' })).not.toBeVisible()
    await u.clear(screen.getByLabelText('Search settings'))
    await u.type(screen.getByLabelText('Search settings'), 'zzz')
    expect(screen.getByText('No settings match')).toBeVisible()
  })
})

describe('per-device settings and grocery aisles', () => {
  it('uses a device’s own text size and Home style, else the household’s', () => {
    expect(textSizeFor({ textSize: 'medium', textSizeBy: { tablet: 'large' } }, 'tablet')).toBe('large')
    expect(textSizeFor({ textSize: 'medium', textSizeBy: { tablet: 'large' } }, 'phone')).toBe('medium')
    expect(homeStyleFor({ homeStyle: { tablet: 'panels' } }, 'tablet')).toBe('panels')
    expect(homeStyleFor({ homeStyle: {} }, 'phone')).toBe('summary')
  })

  it('sorts grocery lists into aisles unless switched off', () => {
    const grocery: FamilyList = { id: 'g', title: 'Grocery List', kind: 'grocery', sections: false, order: 0, categories: [] }
    expect(needsAisles(grocery)).toBe(true)
    expect(needsAisles({ ...grocery, categories: [{ id: 'p', name: 'Produce' }] })).toBe(false)
    expect(needsAisles({ ...grocery, autoSort: false })).toBe(false)
    expect(needsAisles({ ...grocery, kind: 'todo' })).toBe(false)
  })
})
