import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MealTemplates } from './MealTemplates'
import { applyTemplate, templateFromWeek, type MealTemplate } from './templates'

const blank = { breakfast: '', lunch: '', dinner: '', notes: '' }
// A Sunday-start week: Oct 4 (Sun) – Oct 10 (Sat), 2026.
const SUN = '2026-10-04'
const MON = '2026-10-05'

afterEach(() => vi.restoreAllMocks())

describe('meal plan templates', () => {
  it('keeps a week by weekday, so it lands on the right days whichever day the week starts', () => {
    const days = templateFromWeek({ [MON]: { ...blank, dinner: ' Tacos ' }, '2026-10-06': { ...blank, dinner: 'Pasta', notes: 'Soccer' } }, SUN)
    expect(days).toHaveLength(7)
    expect(days[1].dinner).toBe('Tacos') // Monday
    expect(days[2]).toEqual({ ...blank, dinner: 'Pasta', notes: 'Soccer' })
    // Applied to a Monday-start week, Monday's dinner is still on Monday.
    const { changes } = applyTemplate({ days }, '2026-10-12', {}, 'fill')
    expect(changes['2026-10-12'].dinner).toBe('Tacos')
    expect(changes['2026-10-13'].dinner).toBe('Pasta')
  })

  it('fills only empty meals, or replaces the week, and says which meals it added', () => {
    const days = templateFromWeek({ [MON]: { ...blank, breakfast: 'Oatmeal', dinner: 'Tacos' } }, SUN)
    const current = { [MON]: { ...blank, dinner: 'Leftovers' }, '2026-10-07': { ...blank, lunch: 'Sandwiches' } }

    const fill = applyTemplate({ days }, SUN, current, 'fill')
    expect(fill.changes).toEqual({ [MON]: { ...blank, breakfast: 'Oatmeal', dinner: 'Leftovers' } })
    expect(fill.added).toEqual([{ date: MON, slot: 'breakfast', text: 'Oatmeal' }])

    const replace = applyTemplate({ days }, SUN, current, 'replace')
    expect(replace.changes).toEqual({ [MON]: { ...blank, breakfast: 'Oatmeal', dinner: 'Tacos' }, '2026-10-07': blank })
    expect(replace.added.map((m) => m.text)).toEqual(['Oatmeal', 'Tacos'])
    // Nothing to do when the week already matches.
    expect(applyTemplate({ days }, SUN, { [MON]: { ...blank, breakfast: 'Oatmeal', dinner: 'Tacos' } }, 'fill')).toEqual({ changes: {}, added: [] })
  })
})

describe('MealTemplates', () => {
  const t: MealTemplate = { id: 't1', name: 'School week', days: templateFromWeek({ [MON]: { ...blank, dinner: 'Tacos' }, '2026-10-06': { ...blank, dinner: 'Pasta', lunch: 'Soup' } }, SUN) }

  it('saves the week on screen and applies a template to it, with groceries', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => undefined)
    const onApply = vi.fn(async () => 'Planned 2 days from “School week”. Added 9 items to the grocery list.')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MealTemplates weekLabel="Oct 4 – Oct 10" weekEmpty={false} templates={[t]} onSave={onSave} onApply={onApply} onDelete={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/2 dinners, 1 lunch/)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/Save Oct 4 – Oct 10 as a template/), 'Busy week')
    await user.click(screen.getByRole('button', { name: 'Save template' }))
    expect(onSave).toHaveBeenCalledWith('Busy week')
    expect(await screen.findByRole('status')).toHaveTextContent('Saved “Busy week”.')

    await user.click(screen.getByRole('button', { name: 'Use' }))
    await user.click(screen.getByRole('button', { name: 'Replace the week' }))
    await user.click(screen.getByRole('button', { name: 'Apply to Oct 4 – Oct 10' }))
    expect(onApply).toHaveBeenCalledWith(t, 'replace', true)
    expect(await screen.findByRole('status')).toHaveTextContent('Added 9 items to the grocery list.')
  })

  it('asks for a planned week before saving one', () => {
    render(<MealTemplates weekLabel="Oct 4 – Oct 10" weekEmpty templates={[]} onSave={vi.fn()} onApply={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Save template' })).toBeDisabled()
    expect(screen.getByText(/No templates yet/)).toBeInTheDocument()
  })
})
