import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MealTemplates } from './MealTemplates'
import { STARTER_RECIPES } from './starterRecipes'
import { starterDraft } from './starterSeed'
import { STARTER_TEMPLATES } from './starters'
import { applyTemplate, templateFromWeek, templateMealsOn, type MealTemplate, type TemplateDraft } from './templates'

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

const t: MealTemplate = { id: 't1', name: 'School week', days: templateFromWeek({ [MON]: { ...blank, dinner: 'Tacos' }, '2026-10-06': { ...blank, dinner: 'Pasta', lunch: 'Soup' } }, SUN), people: 4, meals: ['lunch', 'dinner'] }
const base = {
    weekStart: SUN,
    currentWeekStart: SUN,
    weekStartsOn: 0,
    weekPlans: {},
    onRemoveFromWeek: vi.fn(async () => 'Took 2 meals from “School week” off this week.'),
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

describe('MealTemplates', () => {
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
    const plan = { lines: ['2 lb ground beef', '1 onion'], details: [{ line: '2 lb ground beef', sources: ['2026-10-12:dinner'] }, { line: '1 onion', sources: ['2026-10-12:dinner'] }], staples: [], onList: [] }
    const onApply = vi.fn(async () => ({ message: 'Planned 2 days of Oct 11 – Oct 17 from “School week”.', groceries: { shopping: { plan, labels: { '2026-10-12:dinner': 'Mon dinner: Tacos' } }, people: 4 } }))
    render(<MealTemplates {...base} onApply={onApply} />)
    await user.click(screen.getByRole('button', { name: 'Use' }))
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    await user.click(screen.getByRole('button', { name: 'Replace the week' }))
    await user.click(screen.getByRole('button', { name: 'Plan Oct 11 – Oct 17' }))
    expect(onApply).toHaveBeenCalledWith(t, { weekStart: '2026-10-11', mode: 'replace', people: 4, groceries: true })
    expect(await screen.findByText('Planned 2 days of Oct 11 – Oct 17 from “School week”.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add 2 to the grocery list' }))
    expect(base.onAddGroceries).toHaveBeenCalledWith([
      { text: '2 lb ground beef', meals: ['2026-10-12:dinner'] },
      { text: '1 onion', meals: ['2026-10-12:dinner'] },
    ])
  })
})

describe('starter templates', () => {
  it('plan every meal of every day, within the limits a template allows', () => {
    expect(STARTER_TEMPLATES).toHaveLength(3)
    for (const s of STARTER_TEMPLATES) {
      expect(s.days).toHaveLength(7)
      for (const d of s.days) {
        for (const k of ['breakfast', 'lunch', 'dinner'] as const) expect(d[k].length).toBeGreaterThan(0)
        for (const k of ['breakfast', 'lunch', 'dinner', 'notes'] as const) expect(d[k].length).toBeLessThanOrEqual(200)
      }
      // Every meal is a starter recipe (so its groceries come with it), except leftovers and eating out.
      const recipe = (title: string) => STARTER_RECIPES.find((r) => r.title === title)
      for (const d of s.days) for (const k of ['breakfast', 'lunch', 'dinner'] as const) if (!/leftovers/i.test(d[k])) expect(recipe(d[k]), d[k]).toBeDefined()
      // Lunches are chicken and rice; one big dinner reheated; a fun Friday or Saturday.
      expect(s.days.every((d) => recipe(d.lunch)!.ingredients.some((l) => /chicken/.test(l)) && recipe(d.lunch)!.ingredients.some((l) => /rice/.test(l)))).toBe(true)
      expect(s.days.filter((d) => /\(leftovers\)/.test(d.dinner)).length).toBeGreaterThanOrEqual(3)
      expect([s.days[5].notes, s.days[6].notes].some((n) => /fun dinner/i.test(n))).toBe(true)
      expect(s.days.some((d) => /burrito bowl/i.test(d.lunch)) && s.days.some((d) => /sesame ginger|peanut|sweet chili/i.test(d.lunch))).toBe(true)
    }
  })

  it('offers the starters not yet added, one at a time or all at once, for the usual number of people', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => undefined)
    const added = { id: 'x', ...STARTER_TEMPLATES[0] }
    render(<MealTemplates {...base} templates={[added]} onSave={onSave} />)
    const section = screen.getByRole('region', { name: 'Starter templates' })
    expect(section).not.toHaveTextContent('Simple week: chili')
    await user.click(screen.getByRole('button', { name: 'Add all 2' }))
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Simple week: curry', people: 3 }))
    expect(await screen.findByRole('status')).toHaveTextContent('Added 2 starter templates.')
  })
})

describe('starter recipes', () => {
  it('are whole recipes, adapted ones credited with a link', () => {
    const titles = new Set<string>()
    for (const r of STARTER_RECIPES) {
      expect(titles.has(r.title), r.title).toBe(false)
      titles.add(r.title)
      expect(r.ingredients.length).toBeGreaterThan(0)
      expect(r.steps.length).toBeGreaterThan(0)
      const d = starterDraft(r)
      expect(d.title.length).toBeLessThanOrEqual(120)
      if (r.from) {
        expect(d.source).toEqual({ type: 'online', siteName: r.from.siteName, url: r.from.url })
        expect(d.url).toMatch(/^https:\/\//)
        expect(d.notes).toContain(`Adapted from ${r.from.siteName}`)
      } else expect(d.source).toEqual({ type: 'manual' })
    }
  })
})

describe('templateMealsOn', () => {
  it('finds the meals of a week still as a template planned them', () => {
    const days = templateFromWeek({ [MON]: { ...blank, dinner: 'Tacos', notes: 'Shop' }, '2026-10-06': { ...blank, lunch: 'Soup' } }, SUN)
    const plans = { [MON]: { ...blank, dinner: 'Tacos', notes: 'Shop' }, '2026-10-06': { ...blank, lunch: 'Sandwiches' } }
    expect(templateMealsOn({ days }, SUN, plans)).toEqual({ keys: [`${MON}:dinner`], notes: [MON] })
  })
})

describe('templates on the week, and starters to update', () => {
  it('says how many of a template’s meals are on the week and takes them off', async () => {
    const user = userEvent.setup()
    const tacos: MealTemplate = { id: 't9', name: 'Taco week', days: templateFromWeek({ [MON]: { ...blank, dinner: 'Tacos' }, '2026-10-06': { ...blank, dinner: 'Pasta' } }, SUN), people: null, meals: ['dinner'] }
    render(<MealTemplates {...base} templates={[tacos]} weekPlans={{ [MON]: { ...blank, dinner: 'Tacos' }, '2026-10-06': { ...blank, dinner: 'Pasta' } }} />)
    expect(screen.getByText(/2 meals on Oct 4 – Oct 10/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove from this week' }))
    expect(base.onRemoveFromWeek).toHaveBeenCalledWith(tacos)
    expect(await screen.findByRole('status')).toHaveTextContent('Took 2 meals from “School week” off this week.')
  })

  it('offers to update a starter added before its meals were named after the starter recipes', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => undefined)
    const old: MealTemplate = { id: 'old', ...STARTER_TEMPLATES[0], days: STARTER_TEMPLATES[0].days.map((d) => ({ ...d, lunch: 'Chicken, rice and broccoli with teriyaki' })), people: 4 }
    render(<MealTemplates {...base} templates={[old]} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: 'Update' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Simple week: chili', people: 4, days: STARTER_TEMPLATES[0].days }), 'old')
  })
})
