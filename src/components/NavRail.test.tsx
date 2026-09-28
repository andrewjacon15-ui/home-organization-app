import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CalendarIcon, HomeIcon, RewardsIcon, SettingsIcon } from './Icons'
import { NavRail, type NavTab } from './NavRail'

type T = 'home' | 'calendar' | 'rewards' | 'settings'
const TABS: NavTab<T>[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon, phone: true },
  { id: 'calendar', label: 'Calendar', Icon: CalendarIcon, phone: true },
  { id: 'rewards', label: 'Rewards', Icon: RewardsIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
]

const rail = () => within(screen.getByRole('navigation', { name: 'Sections' }))

describe('NavRail', () => {
  it('marks phone tabs and hides the rest behind More (styled away on the wall display)', () => {
    render(<NavRail tabs={TABS} current="home" title="The Jacons" onSelect={vi.fn()} />)
    expect(rail().getByRole('button', { name: 'Home' })).not.toHaveClass('rail__item--secondary')
    expect(rail().getByRole('button', { name: 'Rewards' })).toHaveClass('rail__item--secondary')
    expect(rail().getByRole('button', { name: 'More' })).toHaveClass('rail__more')
    expect(rail().getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens a sheet of the other sections and closes it on pick, backdrop, or Escape', () => {
    const onSelect = vi.fn()
    render(<NavRail tabs={TABS} current="home" title="The Jacons" onSelect={onSelect} />)
    const more = rail().getByRole('button', { name: 'More' })

    fireEvent.click(more)
    const sheet = screen.getByRole('dialog', { name: 'More sections' })
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(within(sheet).getByText('The Jacons')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'Home' })).not.toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Settings' }))
    expect(onSelect).toHaveBeenCalledWith('settings')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(more)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(more)
    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('names the More button after the section you are in', () => {
    render(<NavRail tabs={TABS} current="rewards" title="The Jacons" onSelect={vi.fn()} />)
    const more = rail().getByRole('button', { name: 'Rewards', expanded: false })
    expect(more).toHaveClass('rail__item--active')
  })
})
