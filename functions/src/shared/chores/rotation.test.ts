import { describe, expect, it } from 'vitest'
import { assigneeOn, turnIndex } from './rotation.js'

describe('chore rotations', () => {
  it('counts turns for daily and monthly chores', () => {
    expect(turnIndex({ freq: 'daily', interval: 1 }, '2026-10-01', '2026-10-01')).toBe(0)
    expect(turnIndex({ freq: 'daily', interval: 1 }, '2026-10-01', '2026-10-04')).toBe(3)
    expect(turnIndex({ freq: 'daily', interval: 2 }, '2026-10-01', '2026-10-07')).toBe(3)
    expect(turnIndex({ freq: 'monthly', interval: 1 }, '2026-01-31', '2026-04-30')).toBe(3)
  })

  it('counts turns for weekly chores on several days, starting mid-week', () => {
    // Tuesdays and Thursdays, first due Thursday Oct 1, 2026.
    const r = { freq: 'weekly' as const, interval: 1, days: [2, 4] }
    expect(['2026-10-01', '2026-10-06', '2026-10-08', '2026-10-13'].map((k) => turnIndex(r, '2026-10-01', k))).toEqual([0, 1, 2, 3])
    // Every other week, Mondays.
    const b = { freq: 'weekly' as const, interval: 2, days: [1] }
    expect(['2026-10-05', '2026-10-19', '2026-11-02'].map((k) => turnIndex(b, '2026-10-05', k))).toEqual([0, 1, 2])
  })

  it('hands the chore to the next person each time it is due', () => {
    const trash = { assigneeId: 'sam', dueDate: '2026-10-06', repeat: { freq: 'weekly' as const, interval: 1, days: [2] }, rotation: ['sam', 'lydia', 'max'] }
    expect(['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27'].map((k) => assigneeOn(trash, k))).toEqual(['sam', 'lydia', 'max', 'sam'])
    // Without a rotation (or for a one-off) it's the chore's own person.
    expect(assigneeOn({ ...trash, rotation: null }, '2026-10-13')).toBe('sam')
    expect(assigneeOn({ ...trash, repeat: null }, '2026-10-13')).toBe('sam')
  })
})
