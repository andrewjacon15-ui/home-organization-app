import { describe, expect, it } from 'vitest'
import { shortRange, viewRange } from './views'

const s = { weekStartsOn: 0, weekStartToday: false, monthStartCurrentWeek: true, scheduleDays: 7, scheduleStartToday: false }
const at = (hhmm: string) => new Date(`2026-09-29T${hhmm}`)

describe('3-day view', () => {
  it('starts today and pages three days at a time', () => {
    expect(viewRange('threeDay', '2026-09-29', 0, s).days).toEqual(['2026-09-29', '2026-09-30', '2026-10-01'])
    expect(viewRange('threeDay', '2026-09-29', 1, s).days[0]).toBe('2026-10-02')
    expect(viewRange('threeDay', '2026-09-29', -1, s).days[0]).toBe('2026-09-26')
  })
})

describe('shortRange', () => {
  it('writes times the way Skylight does', () => {
    expect(shortRange(at('07:00'), at('11:00'))).toBe('7 – 11 AM')
    expect(shortRange(at('08:41'), at('10:04'))).toBe('8:41 – 10:04 AM')
    expect(shortRange(at('11:30'), at('13:00'))).toBe('11:30 AM – 1 PM')
    expect(shortRange(at('17:00'), at('18:30'))).toBe('5 – 6:30 PM')
    expect(shortRange(at('00:00'), at('12:00'))).toBe('12 AM – 12 PM')
    expect(shortRange(at('09:00'), at('09:00'))).toBe('9 AM')
  })
})
