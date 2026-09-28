import { describe, expect, it } from 'vitest'
import { eventDocId, normalizeEvent } from './normalize.js'

describe('normalizeEvent', () => {
  it('converts a timed event', () => {
    const e = normalizeEvent(
      {
        id: 'abc',
        summary: ' Soccer practice ',
        location: 'Field 3',
        htmlLink: 'https://calendar.google.com/x',
        start: { dateTime: '2026-10-01T17:00:00-04:00' },
        end: { dateTime: '2026-10-01T18:30:00-04:00' },
      },
      'u1',
    )
    expect(e).toEqual({
      source: 'google',
      sourceUserId: 'u1',
      googleEventId: 'abc',
      title: 'Soccer practice',
      location: 'Field 3',
      htmlLink: 'https://calendar.google.com/x',
      allDay: false,
      start: new Date('2026-10-01T21:00:00Z'),
      end: new Date('2026-10-01T22:30:00Z'),
    })
  })

  it('converts an all-day event, keeping Google’s exclusive end date', () => {
    const e = normalizeEvent({ id: 'd1', summary: 'Trip', start: { date: '2026-10-10' }, end: { date: '2026-10-13' } }, 'u1')
    expect(e).toMatchObject({
      allDay: true,
      startDate: '2026-10-10',
      endDate: '2026-10-13',
      start: new Date('2026-10-10T00:00:00Z'),
      end: new Date('2026-10-13T00:00:00Z'),
    })
  })

  it('skips cancelled, id-less, and date-less events', () => {
    expect(normalizeEvent({ id: 'x', status: 'cancelled', start: { date: '2026-10-10' } }, 'u')).toBeNull()
    expect(normalizeEvent({ start: { date: '2026-10-10' } }, 'u')).toBeNull()
    expect(normalizeEvent({ id: 'x' }, 'u')).toBeNull()
  })

  it('fills in a title and repairs an end before the start', () => {
    const e = normalizeEvent({ id: 'x', start: { dateTime: '2026-10-01T10:00:00Z' }, end: { dateTime: '2026-10-01T09:00:00Z' } }, 'u')
    expect(e?.title).toBe('(No title)')
    expect(e?.end).toEqual(e?.start)
  })
})

describe('eventDocId', () => {
  it('is stable and Firestore-safe', () => {
    expect(eventDocId('uid1', 'abc_20261001T150000Z')).toBe('g_uid1_abc_20261001T150000Z')
    expect(eventDocId('u', 'a/b.c')).toBe('g_u_a_b_c')
  })
})
