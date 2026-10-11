import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CountdownPanel } from './Countdowns'
import { daysUntil, nextYearly, ordinal, shownCountdowns, untilLabel, upcoming, yearlyTitle, type GoogleSpecial } from './countdownsApi'
import { easter, upcomingHolidays, usHolidays } from './holidays'

const TODAY = '2026-10-03'

describe('countdown math', () => {
  it('counts whole days, across a month and a clock change', () => {
    expect(daysUntil('2026-10-03', TODAY)).toBe(0)
    expect(daysUntil('2026-10-04', TODAY)).toBe(1)
    expect(daysUntil('2026-11-05', TODAY)).toBe(33)
    expect(daysUntil('2026-10-01', TODAY)).toBe(-2)
  })

  it('says it simply', () => {
    expect(untilLabel(0)).toEqual({ count: 'Today', unit: '' })
    expect(untilLabel(1)).toEqual({ count: '1', unit: 'day' })
    expect(untilLabel(12)).toEqual({ count: '12', unit: 'days' })
    expect(untilLabel(70)).toEqual({ count: '10', unit: 'weeks' })
    expect(untilLabel(200)).toEqual({ count: '7', unit: 'months' })
  })

  it('shows upcoming ones, soonest first, and hides past ones', () => {
    const list = [
      { id: 'b', title: 'Thanksgiving', date: '2026-11-26' },
      { id: 'p', title: 'Last week', date: '2026-09-30' },
      { id: 'a', title: 'Beach trip', date: '2026-10-15' },
    ]
    expect(upcoming(list, TODAY).map((c) => c.id)).toEqual(['a', 'b'])
  })
})

describe('CountdownPanel', () => {
  it('shows each countdown and adds and removes them', async () => {
    const onAdd = vi.fn()
    const onRemove = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(
      <CountdownPanel
        countdowns={[
          { id: 'a', title: 'Beach trip', date: '2026-10-15' },
          { id: 't', title: 'Grandma visits', date: TODAY },
        ]}
        today={TODAY}
        holidays={false}
        onAdd={onAdd}
        onRemove={onRemove}
      />,
    )
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Today')
    expect(items[0]).toHaveTextContent('Grandma visits')
    expect(items[1]).toHaveAccessibleName(/Beach trip: 12 days/)

    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(screen.getByLabelText('What are you counting down to?'), 'Last day of school')
    await user.type(screen.getByLabelText('Date'), '2027-05-28')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith('Last day of school', '2027-05-28', 'once')

    await user.click(screen.getByRole('button', { name: 'Remove Beach trip' }))
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('invites you to add one when there are none', () => {
    render(<CountdownPanel countdowns={[]} today={TODAY} holidays={false} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/Nothing to count down to yet/)).toBeInTheDocument()
  })
})

describe('US holidays', () => {
  it('works out the moving ones', () => {
    const y2026 = Object.fromEntries(usHolidays(2026).map((h) => [h.key, h.date]))
    expect(y2026).toMatchObject({
      mlk: '2026-01-19',
      presidents: '2026-02-16',
      easter: '2026-04-05',
      mothers: '2026-05-10',
      memorial: '2026-05-25',
      fathers: '2026-06-21',
      labor: '2026-09-07',
      columbus: '2026-10-12',
      thanksgiving: '2026-11-26',
    })
    expect(easter(2027)).toBe('2027-03-28')
    expect(easter(2025)).toBe('2025-04-20')
  })

  it('lists the next two months, across the new year', () => {
    expect(upcomingHolidays(TODAY, 60).map((h) => h.title)).toEqual(['Columbus Day', 'Halloween', 'Veterans Day', 'Thanksgiving'])
    expect(upcomingHolidays('2026-12-20', 30).map((h) => h.key)).toEqual(['christmas-eve', 'christmas', 'new-years-eve', 'new-year', 'mlk'])
  })
})

describe('birthdays and anniversaries', () => {
  it('come round every year, with the age or which anniversary', () => {
    expect(nextYearly('1966-11-02', TODAY)).toBe('2026-11-02')
    expect(nextYearly('1990-03-14', TODAY)).toBe('2027-03-14')
    expect(nextYearly('1990-10-03', TODAY)).toBe('2026-10-03')
    // Leap-day birthdays fall on Feb 28 in other years.
    expect(nextYearly('2000-02-29', TODAY)).toBe('2027-02-28')
    expect(nextYearly('2000-02-29', '2027-03-01')).toBe('2028-02-29')
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 30].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '30th'])
    expect(yearlyTitle({ id: 'a', title: 'Mom', date: '1966-11-02', kind: 'birthday' })).toBe('Mom’s birthday')
    expect(yearlyTitle({ id: 'a', title: 'James', date: '1966-11-02', kind: 'birthday' })).toBe('James’ birthday')
    expect(yearlyTitle({ id: 'b', title: 'Our anniversary', date: '2015-06-20', kind: 'anniversary' })).toBe('Our anniversary')

    const shown = shownCountdowns(
      [
        { id: 'm', title: 'Mom', date: '1966-11-02', kind: 'birthday' },
        { id: 'w', title: 'Mom & Dad', date: '1996-10-12', kind: 'anniversary' },
        { id: 't', title: 'Beach trip', date: '2026-10-15', kind: 'once' },
        { id: 'old', title: 'Last week', date: '2026-09-30', kind: 'once' },
      ],
      TODAY,
      { holidays: true, holidayDays: 30 },
    )
    expect(shown.map((c) => [c.title, c.date, c.detail])).toEqual([
      ['Columbus Day', '2026-10-12', null],
      ['Mom & Dad’s anniversary', '2026-10-12', '30th anniversary'],
      ['Beach trip', '2026-10-15', null],
      ['Halloween', '2026-10-31', null],
      ['Mom’s birthday', '2026-11-02', 'turns 60'],
    ])
    expect(shown.find((c) => c.kind === 'holiday')?.source).toBeNull()
  })

  it('are added from the panel as repeating countdowns, and holidays can’t be removed one by one', async () => {
    const onAdd = vi.fn()
    const user = userEvent.setup()
    render(<CountdownPanel countdowns={[{ id: 'm', title: 'Mom', date: '1966-11-02', kind: 'birthday' }]} today={TODAY} onAdd={onAdd} onRemove={vi.fn()} />)
    expect(screen.getByRole('listitem', { name: /Mom’s birthday: 30 days, .* · turns 60/ })).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: /Halloween/ })).queryByRole('button')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.click(screen.getByRole('button', { name: 'Birthday' }))
    expect(screen.getByText(/Repeats every year/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Whose birthday?'), 'Grandpa')
    // A birthday is in the past: that's fine.
    await user.type(screen.getByLabelText(/^Birthday/), '1950-01-15')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith('Grandpa', '1950-01-15', 'birthday')
  })
})

describe('birthdays from Google Calendar', () => {
  const google: GoogleSpecial[] = [
    { id: 'g1', title: 'Mom’s birthday', date: '2026-11-02', kind: 'birthday' },
    // Two people's calendars, the same contact.
    { id: 'g2', title: 'Jake Smith’s birthday', date: '2026-10-20', kind: 'birthday' },
    { id: 'g3', title: "Jake Smith's Birthday", date: '2026-10-20', kind: 'birthday' },
    { id: 'g4', title: 'Grandma & Grandpa’s anniversary', date: '2026-12-01', kind: 'anniversary' },
    { id: 'g5', title: 'Last week’s birthday', date: '2026-09-28', kind: 'birthday' },
  ]

  it('join the countdowns once each, and one saved here (with its year) wins', () => {
    const saved = [{ id: 'm', title: 'Mom', date: '1966-11-02', kind: 'birthday' as const }]
    const shown = shownCountdowns(saved, TODAY, { holidays: false, google })
    expect(shown.map((c) => [c.title, c.date, c.detail, !!c.google])).toEqual([
      ['Jake Smith’s birthday', '2026-10-20', null, true],
      ['Mom’s birthday', '2026-11-02', 'turns 60', false],
      ['Grandma & Grandpa’s anniversary', '2026-12-01', null, true],
    ])
    // They come from Google, so they're removed there (or switched off), not here.
    expect(shown.filter((c) => c.google).every((c) => c.source === null)).toBe(true)
  })

  it('show in the Home panel', () => {
    render(<CountdownPanel countdowns={[]} today={TODAY} holidays={false} google={google} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByRole('listitem', { name: /Jake Smith’s birthday: 17 days/ })).toBeInTheDocument()
  })
})
