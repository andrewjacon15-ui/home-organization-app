import { describe, expect, it } from 'vitest'
import type { Chore } from '../../types'
import { dueLabel, occurrencesOn, occursOn, pruneCompletions, repeatLabel } from './schedule'

const chore = (over: Partial<Chore> & Pick<Chore, 'id' | 'title'>): Chore => ({ assigneeId: 'a', dueDate: '2026-09-28', done: false, points: 1, ...over })
const at = (s: string) => new Date(s)

describe('occursOn', () => {
  it('one-off chores occur on their date only', () => {
    const c = chore({ id: '1', title: 'x' })
    expect(occursOn(c, '2026-09-28')).toBe(true)
    expect(occursOn(c, '2026-09-29')).toBe(false)
  })

  it('daily, every N days, never before the start', () => {
    const d = chore({ id: '1', title: 'x', repeat: { freq: 'daily', interval: 1 } })
    expect(occursOn(d, '2026-09-27')).toBe(false)
    expect(occursOn(d, '2026-09-28')).toBe(true)
    expect(occursOn(d, '2026-10-15')).toBe(true)
    const every3 = chore({ id: '2', title: 'x', repeat: { freq: 'daily', interval: 3 } })
    expect(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].map((k) => occursOn(every3, k))).toEqual([true, false, false, true])
  })

  it('weekly on chosen days, every other week', () => {
    // 2026-09-28 is a Monday
    const trash = chore({ id: '1', title: 'Trash', repeat: { freq: 'weekly', interval: 1, days: [1, 4] } })
    expect(['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-05'].map((k) => occursOn(trash, k))).toEqual([true, false, true, true])
    const biweekly = chore({ id: '2', title: 'Sheets', repeat: { freq: 'weekly', interval: 2 } }) // defaults to Mondays
    expect(['2026-09-28', '2026-10-05', '2026-10-12'].map((k) => occursOn(biweekly, k))).toEqual([true, false, true])
  })

  it('monthly on the same day, clamping to short months', () => {
    const rent = chore({ id: '1', title: 'Rent', dueDate: '2026-01-31', repeat: { freq: 'monthly', interval: 1 } })
    expect(occursOn(rent, '2026-02-28')).toBe(true)
    expect(occursOn(rent, '2026-03-31')).toBe(true)
    expect(occursOn(rent, '2026-03-30')).toBe(false)
  })
})

describe('occurrencesOn', () => {
  const today = '2026-09-28'

  it('carries overdue one-offs and anytime chores onto today only', () => {
    const overdue = chore({ id: 'o', title: 'Overdue', dueDate: '2026-09-22' })
    const anytime = chore({ id: 'a', title: 'Anytime', dueDate: null })
    expect(occurrencesOn([overdue, anytime], today, today).map((o) => [o.chore.id, o.date])).toEqual([
      ['a', today],
      ['o', '2026-09-22'],
    ])
    expect(occurrencesOn([overdue, anytime], '2026-09-29', today)).toEqual([])
  })

  it("shows a repeating chore's missed occurrence as late, until it's due again", () => {
    // Weekly on Tuesdays, started 2026-09-22 (Tue); today is Mon 9/28 → last Tuesday's is late.
    const trash = chore({ id: 't', title: 'Trash', dueDate: '2026-09-22', repeat: { freq: 'weekly', interval: 1, days: [2] } })
    expect(occurrencesOn([trash], today, today).map((o) => o.date)).toEqual(['2026-09-22'])
    // Done last week → nothing late today.
    expect(occurrencesOn([{ ...trash, completions: { '2026-09-22': 'a' } }], today, today)).toEqual([])
    // A daily chore shows today's occurrence, not yesterday's miss.
    const daily = chore({ id: 'd', title: 'Plants', dueDate: '2026-09-20', repeat: { freq: 'daily', interval: 1 } })
    expect(occurrencesOn([daily], today, today).map((o) => o.date)).toEqual([today])
  })

  it('tracks completion per occurrence and who did it', () => {
    const daily = chore({ id: 'd', title: 'Plants', repeat: { freq: 'daily', interval: 1 }, completions: { '2026-09-28': 'l' } })
    const [o] = occurrencesOn([daily], today, today)
    expect(o).toMatchObject({ done: true, doneBy: 'l' })
    expect(occurrencesOn([daily], '2026-09-29', today)[0].done).toBe(false)
  })
})

describe('dueLabel', () => {
  const today = '2026-09-28'
  it('says how late, or when it is due', () => {
    const plants = chore({ id: 'p', title: 'Plants', dueTime: '10:00' })
    expect(dueLabel({ chore: plants, date: today, done: false, doneBy: null }, at('2026-09-28T19:30'), today)).toEqual({ text: '9 hours late', late: true })
    expect(dueLabel({ chore: plants, date: today, done: false, doneBy: null }, at('2026-09-28T10:20'), today)).toEqual({ text: '20 min late', late: true })
    expect(dueLabel({ chore: plants, date: today, done: false, doneBy: null }, at('2026-09-28T07:00'), today).text).toMatch(/^Today · 10:00/)
    expect(dueLabel({ chore: chore({ id: 't', title: 'Trash' }), date: '2026-09-22', done: false, doneBy: null }, at('2026-09-28T19:30'), today)).toEqual({ text: '6 days late', late: true })
    expect(dueLabel({ chore: chore({ id: 'n', title: 'x', dueDate: null }), date: today, done: false, doneBy: null }, at('2026-09-28T19:30'), today).text).toBe('Anytime')
    expect(dueLabel({ chore: plants, date: today, done: true, doneBy: null }, at('2026-09-28T19:30'), today).late).toBe(false)
  })
})

describe('repeatLabel', () => {
  it('describes the schedule', () => {
    expect(repeatLabel(null)).toBeNull()
    expect(repeatLabel({ freq: 'daily', interval: 1 })).toBe('Every day')
    expect(repeatLabel({ freq: 'daily', interval: 2 })).toBe('Every 2 days')
    expect(repeatLabel({ freq: 'weekly', interval: 1, days: [1, 2, 3, 4, 5] })).toBe('Weekdays')
    expect(repeatLabel({ freq: 'weekly', interval: 2, days: [0, 3] })).toMatch(/^Every 2 weeks on /)
    expect(repeatLabel({ freq: 'monthly', interval: 1 })).toBe('Every month')
  })
})

describe('pruneCompletions', () => {
  it('keeps about the last 90 days', () => {
    expect(pruneCompletions({ '2026-01-01': 'a', '2026-09-01': 'b' }, '2026-09-28')).toEqual({ '2026-09-01': 'b' })
  })
})
