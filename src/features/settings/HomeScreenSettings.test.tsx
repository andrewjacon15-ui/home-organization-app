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
  it('defaults to Countdowns, Lists, Tasks, then Calendar', () => {
    expect(homePanelsFor(undefined, 'tablet')).toEqual(['countdowns', 'lists', 'tasks', 'calendar'])
    expect(homePanelsFor({ phone: ['calendar', 'bogus', 'calendar'] }, 'phone')).toEqual(['calendar'])
    expect(homePanelsFor({ phone: [] }, 'phone')).toEqual([])
  })

  it('puts Countdowns on top of Homes saved before they existed, once', () => {
    expect(homePanelsFor({ tablet: ['lists', 'calendar'] }, 'tablet', 0)).toEqual(['countdowns', 'lists', 'calendar'])
    expect(homePanelsFor({ tablet: ['calendar', 'countdowns'] }, 'tablet', 0)).toEqual(['countdowns', 'calendar'])
    // After the household saves its Home screen again, its order stands.
    expect(homePanelsFor({ tablet: ['lists', 'calendar'] }, 'tablet', 2)).toEqual(['lists', 'calendar'])
  })

  it('reorders and hides panels for one kind of device', () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    expect(order()).toEqual(['Countdowns', 'Lists', "Today's tasks", 'Calendar', 'Weather'])
    expect(screen.getByRole('button', { name: 'Move Countdowns up' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Move Calendar up' }))
    expect(onSave).toHaveBeenLastCalledWith({ tablet: ['countdowns', 'lists', 'calendar', 'tasks'] })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lists' }))
    expect(onSave).toHaveBeenLastCalledWith({ tablet: ['countdowns', 'calendar', 'tasks'] })
    // Hidden panels sink to the bottom; showing one again adds it at the end.
    expect(order()).toEqual(['Countdowns', 'Calendar', "Today's tasks", 'Lists', 'Weather'])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lists' }))
    expect(onSave).toHaveBeenLastCalledWith({ tablet: ['countdowns', 'calendar', 'tasks', 'lists'] })
  })
})
