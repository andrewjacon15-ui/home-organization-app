import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { homePanelsFor } from '../home/homePanels'
import { HomePanelEditor } from './HomeScreenSettings'
import type { DisplaySettings } from './settingsApi'

function Harness({ onSave, initial = {} }: { onSave: (v: DisplaySettings['homePanels']) => void; initial?: DisplaySettings['homePanels'] }) {
  const [value, setValue] = useState(initial)
  return (
    <HomePanelEditor
      value={value}
      device="tablet"
      onChange={(v) => {
        setValue(v)
        onSave(v)
      }}
    />
  )
}

const order = () => within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent)

describe('Home screen panels', () => {
  it('defaults to Lists, then Tasks, then Calendar', () => {
    expect(homePanelsFor(undefined, 'tablet')).toEqual(['lists', 'tasks', 'calendar'])
    expect(homePanelsFor({ phone: ['calendar', 'bogus', 'calendar'] }, 'phone')).toEqual(['calendar'])
    expect(homePanelsFor({ phone: [] }, 'phone')).toEqual([])
  })

  it('reorders and hides panels for one kind of device', () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    expect(order()).toEqual(['Lists', "Today's tasks", 'Calendar', 'Weather'])
    expect(screen.getByRole('button', { name: 'Move Lists up' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Move Calendar up' }))
    expect(onSave).toHaveBeenLastCalledWith({ tablet: ['lists', 'calendar', 'tasks'] })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lists' }))
    expect(onSave).toHaveBeenLastCalledWith({ tablet: ['calendar', 'tasks'] })
    // Hidden panels sink to the bottom; showing one again adds it at the end.
    expect(order()).toEqual(['Calendar', "Today's tasks", 'Lists', 'Weather'])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lists' }))
    expect(onSave).toHaveBeenLastCalledWith({ tablet: ['calendar', 'tasks', 'lists'] })
  })
})
