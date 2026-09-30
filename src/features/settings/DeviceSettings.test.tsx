import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SidebarGrid } from './DeviceSettings'
import type { DisplaySettings } from './settingsApi'

function Harness({ onSave }: { onSave: (h: DisplaySettings['hiddenTabs']) => void }) {
  const [hidden, setHidden] = useState<DisplaySettings['hiddenTabs']>({ phone: ['recipes'] })
  return (
    <SidebarGrid
      hidden={hidden}
      current="tablet"
      onChange={(h) => {
        setHidden(h)
        onSave(h)
      }}
    />
  )
}

describe('SidebarGrid', () => {
  it('shows each section per device and marks this device', () => {
    render(<Harness onSave={vi.fn()} />)
    expect(screen.getByText('This device')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Show Recipes on phone' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Show Recipes on tablet' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Show Settings on computer' })).toBeDisabled()
  })

  it('hides and re-shows sections for one kind of device', () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Rewards on tablet' }))
    expect(onSave).toHaveBeenLastCalledWith({ phone: ['recipes'], tablet: ['rewards'] })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Recipes on phone' }))
    expect(onSave).toHaveBeenLastCalledWith({ phone: [], tablet: ['rewards'] })
  })
})
