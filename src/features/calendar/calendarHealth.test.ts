import { describe, expect, it } from 'vitest'
import type { Member, MemberCalendarStatus } from '../../types'
import { calendarTrouble, STALE_MS } from './calendarHealth'

const now = new Date(2026, 9, 10, 18, 0)
const at = (ms: number) => ({ toDate: () => new Date(now.getTime() - ms) })
const person = (id: string, displayName: string, calendar?: MemberCalendarStatus): Member => ({ id, displayName, email: `${id}@x.test`, color: '#15803d', calendar })
const fresh = (id: string, name: string) => person(id, name, { status: 'connected', email: `${id}@x.test`, lastSyncAt: at(20 * 60_000) })
const expired = (id: string, name: string) => person(id, name, { status: 'needs_reconnect', email: `${id}@x.test` })

describe('calendarTrouble', () => {
  it('is quiet when every calendar is current, or nobody connected one', () => {
    expect(calendarTrouble([fresh('a', 'Andrew Jacobs'), person('l', 'Lydia')], 'a', now)).toBeNull()
  })

  it('names whose Google access expired, and who can fix it', () => {
    expect(calendarTrouble([fresh('a', 'Andrew Jacobs'), expired('l', 'Lydia Jacobs')], 'a', now)).toBe('Lydia’s Google Calendar stopped updating. Lydia can reconnect it in Calendar.')
    expect(calendarTrouble([expired('a', 'Andrew Jacobs'), fresh('l', 'Lydia')], 'a', now)).toBe('Your Google Calendar stopped updating. Reconnect it in Calendar.')
    expect(calendarTrouble([expired('a', 'Andrew'), expired('l', 'Lydia')], 'a', now)).toBe('Google Calendar stopped updating for you and Lydia. Reconnect it in Calendar.')
    expect(calendarTrouble([expired('l', 'Lydia'), expired('s', 'Sam')], 'a', now)).toBe('Google Calendar stopped updating for Lydia and Sam. Each can reconnect it in Calendar.')
  })

  it('says when a calendar hasn’t synced for hours (it normally does every 15 minutes)', () => {
    const late = person('l', 'Lydia', { status: 'connected', email: 'l@x.test', lastSyncAt: at(STALE_MS + 60_000) })
    expect(calendarTrouble([fresh('a', 'Andrew'), late], 'a', now)).toMatch(/^Google Calendar hasn’t updated since .*(AM|PM)?.*, so events may be out of date\.$/)
    const lastWeek = person('l', 'Lydia', { status: 'connected', email: 'l@x.test', lastSyncAt: at(9 * 86_400_000) })
    expect(calendarTrouble([lastWeek], 'a', now)).toContain('since Oct 1')
    expect(calendarTrouble([person('l', 'Lydia', { status: 'connected', email: 'l@x.test', lastSyncAt: at(STALE_MS - 60_000) })], 'a', now)).toBeNull()
  })
})
