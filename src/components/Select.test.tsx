import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Select } from './Select'

const OPTIONS = [
  { value: 'b', label: 'Breakfast' },
  { value: 'l', label: 'Lunch' },
  { value: 'd', label: 'Dinner' },
]

function Harness() {
  const [v, setV] = useState('b')
  return (
    <>
      <label className="field">
        Meal
        <Select value={v} onChange={setV} options={OPTIONS} />
      </label>
      <p data-testid="value">{v}</p>
      <button type="button">Elsewhere</button>
    </>
  )
}

describe('Select', () => {
  it('opens on tap, marks the current choice, and picks another (inside a label)', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const box = screen.getByLabelText('Meal')
    expect(box).toHaveTextContent('Breakfast')
    await user.click(box)
    expect(screen.getByRole('option', { name: 'Breakfast' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('option', { name: 'Dinner' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('value')).toHaveTextContent('d')
    expect(box).toHaveTextContent('Dinner')
  })

  it('works from the keyboard and closes on a tap elsewhere', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const box = screen.getByLabelText('Meal')
    box.focus()
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(screen.getByTestId('value')).toHaveTextContent('l')
    expect(box).toHaveFocus()
    await user.keyboard('d')
    expect(screen.getByTestId('value')).toHaveTextContent('d')
    await user.click(box)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await user.click(box)
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
