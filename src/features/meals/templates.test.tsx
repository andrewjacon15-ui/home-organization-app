import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MealTemplates } from './MealTemplates'
import { applyTemplate, templateFromWeek, type MealTemplate, type TemplateDraft } from './templates'

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
  const t: MealTemplate = { id: 't1', name: 'School week', days: templateFromWeek({ [MON]: { ...blank, dinner: 'Tacos' }, '2026-10-06': { ...blank, dinner: 'Pasta', lunch: 'Soup' } }, SUN), people: 4, meals: ['lunch', 'dinner'] }
  const base = {
    weekStart: SUN,
    currentWeekStart: SUN,
    weekStartsOn: 0,
    fromWeek: null,
    templates: [t],
    titles: ['Tacos', 'Pasta', 'Chili', 'Soup'],
    defaultPeople: 3,
    pick: vi.fn(async (wanted: { day: string; slot: string }[]) => Object.fromEntries(wanted.map((w, i) => [`${w.day}:${w.slot}`, ['Chili', 'Curry', 'Stir fry'][i % 3]]))),
    onSave: vi.fn(async () => undefined),
    onApply: vi.fn(async () => ({ message: 'Planned 2 days of Oct 4 – Oct 10 from “School week”.' })),
    onAddGroceries: vi.fn(async () => undefined),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  }

  it('makes a template from scratch: name, how many, which meals, typed or random dinners', async () => {
    const user = userEvent.setup()
    render(<MealTemplates {...base} templates={[]} />)
    expect(screen.getByText(/No templates yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save Oct 4 – Oct 10 as a template/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'New template' }))
    await user.type(screen.getByLabelText('Name'), 'Busy week')
    await user.type(screen.getByLabelText('Monday dinner'), 'Tacos')
    await user.click(screen.getByRole('button', { name: 'Randomize Tuesday dinner' }))
    expect(screen.getByLabelText('Tuesday dinner')).toHaveValue('Chili')
    // Typed and picked meals are never picked again.
    expect(base.pick).toHaveBeenLastCalledWith([{ day: '2', slot: 'dinner' }], ['Tacos'])
    await user.click(screen.getByRole('button', { name: 'Randomize empty meals' }))
    expect(base.pick).toHaveBeenLastCalledWith(expect.arrayContaining([{ day: '0', slot: 'dinner' }, { day: '6', slot: 'dinner' }]), ['Tacos', 'Chili'])
    expect(base.pick.mock.lastCall![0]).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: 'Save template' }))
    expect(base.onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Busy week', people: 3, meals: ['dinner'] }), undefined)
    const saved = (base.onSave.mock.lastCall as unknown as [TemplateDraft])[0]
    expect(saved.days[1].dinner).toBe('Tacos')
    expect(saved.days[2].dinner).toBe('Chili')
    expect(await screen.findByRole('status')).toHaveTextContent('Saved “Busy week”.')
  })

  it('asks for a name, and keeps at least one meal', async () => {
    const user = userEvent.setup()
    render(<MealTemplates {...base} templates={[]} />)
    await user.click(screen.getByRole('button', { name: 'New template' }))
    await user.click(screen.getByRole('button', { name: 'Dinner' }))
    expect(screen.getByRole('button', { name: 'Dinner' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Save template' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Give the template a name')
  })

  it('edits and copies a template, keeping its meals and people', async () => {
    const user = userEvent.setup()
    render(<MealTemplates {...base} />)
    expect(screen.getByText(/2 dinners, 1 lunch · for 4/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit template School week' }))
    expect(screen.getByLabelText('Tuesday lunch')).toHaveValue('Soup')
    await user.clear(screen.getByLabelText('Monday dinner'))
    await user.type(screen.getByLabelText('Monday dinner'), 'Chili')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(base.onSave).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'School week', people: 4, meals: ['lunch', 'dinner'] }), 't1')
    await user.click(await screen.findByRole('button', { name: 'Copy template School week' }))
    expect(screen.getByLabelText('Name')).toHaveValue('School week copy')
  })

  it('puts a template on next week for some people, then shows its grocery list to look over', async () => {
    const user = userEvent.setup()
    const plan = { lines: ['2 lb ground beef', '1 onion'], details: [{ line: '2 lb ground beef', sources: ['Mon dinner: Tacos'] }, { line: '1 onion', sources: ['Mon dinner: Tacos'] }], staples: [], onList: [] }
    const onApply = vi.fn(async () => ({ message: 'Planned 2 days of Oct 11 – Oct 17 from “School week”.', groceries: { plan, people: 4 } }))
    render(<MealTemplates {...base} onApply={onApply} />)
    await user.click(screen.getByRole('button', { name: 'Use' }))
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    await user.click(screen.getByRole('button', { name: 'Replace the week' }))
    await user.click(screen.getByRole('button', { name: 'Plan Oct 11 – Oct 17' }))
    expect(onApply).toHaveBeenCalledWith(t, { weekStart: '2026-10-11', mode: 'replace', people: 4, groceries: true })
    expect(await screen.findByText('Planned 2 days of Oct 11 – Oct 17 from “School week”.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add 2 to the grocery list' }))
    expect(base.onAddGroceries).toHaveBeenCalledWith(['2 lb ground beef', '1 onion'])
  })
})
